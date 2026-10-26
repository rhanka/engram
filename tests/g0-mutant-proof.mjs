// G0 mutation-kill proof (Node only, no Python).
//
// For each semantic preimage input in §7.4 and for each row of the admission
// rule table, this script applies exactly one textual mutation to a temp copy
// of the module, bundles it with esbuild, and asserts that the committed
// expectation flips (an inequality becomes an equality, a refusal becomes an
// admission, or a typed refusal reason changes). A flip means the committed
// test — which asserts the unflipped expectation — would fail on the mutant,
// so the fixture kills the mutant.
//
// Exit 0 iff every mutant is killed; non-zero on any survivor or setup
// failure. Temp copies live under os.tmpdir(); nothing is written to the repo.
import { buildSync } from "esbuild";
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, "..", "src", "ontology-guardian");
const A64 = "a".repeat(64);
const B64 = "b".repeat(64);
const pin = (id, version = "1.0.0", contentDigest = A64) => ({ contentDigest, id, version });

function copyModule() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "g0mut-"));
  for (const file of fs.readdirSync(SRC)) {
    fs.copyFileSync(path.join(SRC, file), path.join(dir, file));
  }
  return dir;
}

let bundleCount = 0;
async function bundle(entryFile) {
  bundleCount += 1;
  const out = path.join(path.dirname(entryFile), `out-${bundleCount}-${path.basename(entryFile, ".ts")}.mjs`);
  buildSync({
    entryPoints: [entryFile],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile: out,
    logLevel: "silent",
  });
  return import(pathToFileURL(out).href);
}

// Pristine bundles: the baseline every mutant is compared against.
const pristineDir = copyModule();
const clean = {
  digests: await bundle(path.join(pristineDir, "digests.ts")),
  diagnostics: await bundle(path.join(pristineDir, "diagnostics.ts")),
  admission: await bundle(path.join(pristineDir, "admission.ts")),
};
const D = clean.digests;

function mutate(entryName, find, replace) {
  const dir = copyModule();
  const target = path.join(dir, entryName);
  const text = fs.readFileSync(target, "utf8");
  const count = text.split(find).length - 1;
  if (count !== 1) {
    throw new Error(`mutant setup failure: find occurs ${count}x (need exactly 1x) in ${entryName}: ${find.slice(0, 100)}`);
  }
  fs.writeFileSync(target, text.replace(find, replace));
  return bundle(path.join(dir, entryName));
}

// --- Shared admission fixtures (minimal mirrors of the committed fixtures). ---

function warnSelection() {
  const settings = [{ classification: "readiness", rule: "label-required", severity: "warn" }];
  return {
    phase: "import",
    readinessPolicy: "draft",
    settings,
    severityPolicyDigest: D.severityPolicyDigestOf("import", "draft", settings),
    rules: [{ ruleId: "label-required", severity: "warn" }],
  };
}

function admEntry(extra = {}) {
  const layers = [pin("generic")];
  return {
    stack: layers,
    pinsDigest: D.pinsDigestOf({ layers }),
    resultEvidence: { evidenceState: "resolved", digest: A64 },
    profilePin: pin("generic"),
    corpusDigest: B64,
    selections: [warnSelection()],
    ruleSheetPins: [pin("sheet-a")],
    visibility: "public",
    ...extra,
  };
}

function evaluatedStack() {
  const layers = [pin("generic")];
  return { stack: layers, pinsDigest: D.pinsDigestOf({ layers }), resultEvidence: { evidenceState: "resolved", digest: A64 } };
}

function parityReceipt(extra = {}, pbExtra = {}) {
  const settings = [{ classification: "readiness", rule: "label-required", severity: "warn" }];
  const digest = D.severityPolicyDigestOf("import", "draft", settings);
  return {
    receiptKind: "bpmn-parity",
    corpusDigest: B64,
    libraryId: "bpmn-canvas",
    libraryVersion: "1.0.0",
    validatorRole: "transitional-oracle",
    transitionQualification: { claim: "oracle-witness", parityMatrixDigest: B64 },
    verdict: "pass",
    issuedAt: "2026-10-26",
    evaluatedStack: evaluatedStack(),
    proofBindings: {
      proofSet: "published-corpus",
      corpusAuthority: { tag: "profile-corpus-v1.0.0", manifestDigest: B64 },
      profilePin: pin("generic"),
      severityPolicyDigest: digest,
      ruleSheetPins: [pin("sheet-a")],
      compiledLintEvidence: {
        scope: "public",
        compiledOptions: {
          mechanismVersion: "1",
          profileDigest: A64,
          phase: "import",
          readinessPolicy: "draft",
          compiledRules: [],
          bindings: [],
          severityPolicyDigest: digest,
        },
        settings,
      },
      ...pbExtra,
    },
    ruleVerdicts: [{ ruleId: "label-required", severity: "warn", verdict: "pass", parity: "proven" }],
    ...extra,
  };
}

const PARITY_REQ = { receiptKind: "bpmn-parity", libraryId: "bpmn-canvas", libraryVersion: "1.0.0" };

function refusesWith(ns, request, fragment) {
  const verdict = ns.checkAdmission(request);
  assert.strictEqual(verdict.admitted, false, "baseline must refuse");
  assert.ok(
    typeof verdict.reason === "string" && verdict.reason.includes(fragment),
    `baseline reason must contain ${fragment}, got: ${verdict.reason}`,
  );
}

// Every case: the committed test it mirrors, the one-line mutation, and the
// flip assertion (baseline expectation vs mutant behavior).
const cases = [
  {
    id: "M1",
    test: "FX-DIG-P3 / R1",
    entry: "digests.ts",
    find: `    ruleSheets: (input.ruleSheets ?? []).map((p) => ({
      contentDigest: p.contentDigest,
      id: p.id,
      version: p.version,
    })),`,
    replace: `    ruleSheets: [],`,
    run: (mut, base) => {
      const layers = [pin("generic")];
      assert.notStrictEqual(
        base.pinsDigestOf({ layers, ruleSheets: [pin("s1")] }),
        base.pinsDigestOf({ layers, ruleSheets: [pin("s2")] }),
      );
      assert.strictEqual(
        mut.pinsDigestOf({ layers, ruleSheets: [pin("s1")] }),
        mut.pinsDigestOf({ layers, ruleSheets: [pin("s2")] }),
      );
    },
  },
  {
    id: "M2",
    test: "FX-DIG-P4 / R2",
    entry: "digests.ts",
    find: `    base: { contentDigest: input.base.contentDigest, id: input.base.id, version: input.base.version },`,
    replace: `    base: null,`,
    run: (mut, base) => {
      const shell = { mappingRef: null, operations: [{ op: "add", subject: "t", declarationDigest: B64 }], retiredFixtures: [], retiredRules: [] };
      assert.notStrictEqual(
        base.deltaDigestOf({ ...shell, base: pin("generic") }),
        base.deltaDigestOf({ ...shell, base: pin("other") }),
      );
      assert.strictEqual(
        mut.deltaDigestOf({ ...shell, base: pin("generic") }),
        mut.deltaDigestOf({ ...shell, base: pin("other") }),
      );
    },
  },
  {
    id: "M3",
    test: "R3 (mapping childRole)",
    entry: "digests.ts",
    find: `    entries: input.entries.map((e) => ({ ...e })),`,
    replace: `    entries: input.entries.map((e) => {
      const rest = { ...(e as Record<string, unknown>) };
      delete rest["childRole"];
      return rest;
    }),`,
    run: (mut, base) => {
      const e = (childRole) => ({
        mappingId: "m",
        version: "1.0.0",
        entries: [{ kind: "hierarchy", relationId: "r", chosenShape: "dag", parentRole: "p", childRole }],
      });
      assert.notStrictEqual(base.mappingDigestOf(e("c")), base.mappingDigestOf(e("other")));
      assert.strictEqual(mut.mappingDigestOf(e("c")), mut.mappingDigestOf(e("other")));
    },
  },
  {
    id: "M4",
    test: "R4 (endpoint role)",
    entry: "digests.ts",
    find: `    entries: input.entries.map((e) => ({ ...e })),`,
    replace: `    entries: input.entries.map((e) => {
      const rest = { ...(e as Record<string, unknown>) };
      delete rest["role"];
      return rest;
    }),`,
    run: (mut, base) => {
      const e = (role) => ({
        mappingId: "m",
        version: "1.0.0",
        entries: [{ kind: "endpoint", from: "rel", to: "rel2", role }],
      });
      assert.notStrictEqual(base.mappingDigestOf(e("source")), base.mappingDigestOf(e("target")));
      assert.strictEqual(mut.mappingDigestOf(e("source")), mut.mappingDigestOf(e("target")));
    },
  },
  {
    id: "M5",
    test: "FX-DIG-R2 / R5 (result-row severity)",
    entry: "digests.ts",
    find: `    effectiveRuleSet: input.effectiveRuleSet.map((r) => ({
      classification: r.classification,
      code: r.code,
      messageKey: r.messageKey,
      ruleBody: r.ruleBody,
      ruleId: r.ruleId,
      severity: r.severity,
    })),`,
    replace: `    effectiveRuleSet: input.effectiveRuleSet.map((r) => ({
      classification: r.classification,
      code: r.code,
      messageKey: r.messageKey,
      ruleBody: r.ruleBody,
      ruleId: r.ruleId,
    })),`,
    run: (mut, base) => {
      const row = (severity) => ({
        classification: "readiness",
        code: "c",
        messageKey: "k",
        ruleBody: {},
        ruleId: "r",
        severity,
      });
      const preimage = (severity) => ({ effectiveDeclarations: {}, effectiveRuleSet: [row(severity)], severityPolicyDigest: A64 });
      assert.notStrictEqual(base.resultDigestOf(preimage("warn")), base.resultDigestOf(preimage("error")));
      assert.strictEqual(mut.resultDigestOf(preimage("warn")), mut.resultDigestOf(preimage("error")));
    },
  },
  {
    id: "M6",
    test: "R6 (per-rule bindings)",
    entry: "digests.ts",
    find: `      ruleBody: r.ruleBody,`,
    replace: `      ruleBody: JSON.parse(JSON.stringify(r.ruleBody, (k, v) => (k === "bindings" ? undefined : v))),`,
    run: (mut, base) => {
      const row = (bindings) => ({
        classification: "readiness",
        code: "c",
        messageKey: "k",
        ruleBody: { id: "r", bindings },
        ruleId: "r",
        severity: "warn",
      });
      const preimage = (bindings) => ({ effectiveDeclarations: {}, effectiveRuleSet: [row(bindings)], severityPolicyDigest: A64 });
      const withBindings = [{ ownerId: "o", role: "r", targetId: "t" }];
      assert.notStrictEqual(base.resultDigestOf(preimage(withBindings)), base.resultDigestOf(preimage([])));
      assert.strictEqual(mut.resultDigestOf(preimage(withBindings)), mut.resultDigestOf(preimage([])));
    },
  },
  {
    id: "M7",
    test: "FX-DIG-C7 (irrelevant theme input)",
    entry: "digests.ts",
    find: `    portTypes: [...profile.portTypes],`,
    replace: `    portTypes: [...profile.portTypes],
    themeRef: (profile.themeRef as unknown as string | null | undefined) ?? null,`,
    run: (mut, base) => {
      const profile = { profile: "generic@1", completeness: "complete", entityTypes: [], portTypes: [], relationTypes: [], constraints: [], limits: {} };
      assert.strictEqual(
        base.contentDiagramDigest({ ...profile, themeRef: "dark@2" }),
        base.contentDiagramDigest({ ...profile, themeRef: "light@1" }),
      );
      assert.notStrictEqual(
        mut.contentDiagramDigest({ ...profile, themeRef: "dark@2" }),
        mut.contentDiagramDigest({ ...profile, themeRef: "light@1" }),
      );
    },
  },
  {
    id: "M8",
    test: "FX-DIG-P6 (irrelevant theme state)",
    entry: "digests.ts",
    find: `    mappingDigest: input.mappingDigest ?? null,`,
    replace: `    mappingDigest: input.mappingDigest ?? null,
    themeState: (input.themeState as unknown as string | null | undefined) ?? null,`,
    run: (mut, base) => {
      const layers = [pin("generic")];
      assert.strictEqual(
        base.pinsDigestOf({ layers, themeState: { theme: "dark@2" } }),
        base.pinsDigestOf({ layers, themeState: { theme: "light@1" } }),
      );
      assert.notStrictEqual(
        mut.pinsDigestOf({ layers, themeState: { theme: "dark@2" } }),
        mut.pinsDigestOf({ layers, themeState: { theme: "light@1" } }),
      );
    },
  },
  {
    id: "M9",
    test: "FX-DIG-R5 (irrelevant catalog metadata)",
    entry: "digests.ts",
    find: `    severityPolicyDigest: input.severityPolicyDigest,
  };
}

/** Guardian-computable scopes (diagram/engram): SHA-256 over P-RESULT bytes. */`,
    replace: `    severityPolicyDigest: input.severityPolicyDigest,
    catalogMetadata: (input.catalogMetadata as unknown) ?? null,
  };
}

/** Guardian-computable scopes (diagram/engram): SHA-256 over P-RESULT bytes. */`,
    run: (mut, base) => {
      const preimage = (catalogMetadata) => ({ effectiveDeclarations: {}, effectiveRuleSet: [], severityPolicyDigest: A64, catalogMetadata });
      assert.strictEqual(base.resultDigestOf(preimage({ owner: "a" })), base.resultDigestOf(preimage({ owner: "b" })));
      assert.notStrictEqual(mut.resultDigestOf(preimage({ owner: "a" })), mut.resultDigestOf(preimage({ owner: "b" })));
    },
  },
  {
    id: "M10",
    test: "FX-DIG-E6 (self-embedded entry digest)",
    entry: "digests.ts",
    find: `  if ("entryDigest" in entry) throw new Error("entry-digest-self-embedded");`,
    replace: `  if ("entryDigest" in entry) { void entry; }`,
    run: (mut, base) => {
      assert.throws(() => base.entryDigestOf({ kind: "o", entryDigest: A64 }), /self-embedded/);
      assert.doesNotThrow(() => mut.entryDigestOf({ kind: "o", entryDigest: A64 }));
    },
  },
  {
    id: "M11",
    test: "P-DELTA newName hashed (rename payload)",
    entry: "digests.ts",
    find: `        ? { declarationDigest: op.declarationDigest, newName: op.newName, op: op.op, subject: op.subject }`,
    replace: `        ? { declarationDigest: op.declarationDigest, op: op.op, subject: op.subject }`,
    run: (mut, base) => {
      const shell = { base: pin("generic"), mappingRef: null, retiredFixtures: [], retiredRules: [] };
      const op = (newName) => ({ op: "rename-with-mapping", subject: "a", declarationDigest: B64, newName });
      assert.notStrictEqual(base.deltaDigestOf({ ...shell, operations: [op("b")] }), base.deltaDigestOf({ ...shell, operations: [op("c")] }));
      assert.strictEqual(mut.deltaDigestOf({ ...shell, operations: [op("b")] }), mut.deltaDigestOf({ ...shell, operations: [op("c")] }));
    },
  },
  {
    id: "M12",
    test: "FX-DIG-C2 (entity type input)",
    entry: "digests.ts",
    find: `    entityTypes: [...profile.entityTypes],`,
    replace: `    entityTypes: [],`,
    run: (mut, base) => {
      const shell = { profile: "generic@1", completeness: "complete", portTypes: [], relationTypes: [], constraints: [], limits: {} };
      assert.notStrictEqual(
        base.contentDiagramDigest({ ...shell, entityTypes: [{ id: "a" }] }),
        base.contentDiagramDigest({ ...shell, entityTypes: [{ id: "b" }] }),
      );
      assert.strictEqual(
        mut.contentDiagramDigest({ ...shell, entityTypes: [{ id: "a" }] }),
        mut.contentDiagramDigest({ ...shell, entityTypes: [{ id: "b" }] }),
      );
    },
  },
  {
    id: "M12b",
    test: "FX-DIG-C6 (omitted limit is null, never 0)",
    entry: "digests.ts",
    find: `  return value ?? null;`,
    replace: `  return value ?? 0;`,
    run: (mut, base) => {
      const skeleton = { profile: "bpmn@1", completeness: "skeleton", entityTypes: [], portTypes: [], relationTypes: [], constraints: [], limits: {} };
      const zeroed = { ...skeleton, limits: { maxEntities: 0, maxRelations: 0 } };
      assert.notStrictEqual(base.contentDiagramDigest(skeleton), base.contentDiagramDigest(zeroed));
      assert.strictEqual(mut.contentDiagramDigest(skeleton), mut.contentDiagramDigest(zeroed));
    },
  },
  {
    id: "M13",
    test: "FX-DIG-P2 (layer order)",
    entry: "digests.ts",
    find: `    layers: input.layers.map((p) => ({ contentDigest: p.contentDigest, id: p.id, version: p.version })),`,
    replace: `    layers: [...input.layers]
      .sort((a, b) => (a.id < b.id ? -1 : 1))
      .map((p) => ({ contentDigest: p.contentDigest, id: p.id, version: p.version })),`,
    run: (mut, base) => {
      assert.notStrictEqual(base.pinsDigestOf({ layers: [pin("a"), pin("b")] }), base.pinsDigestOf({ layers: [pin("b"), pin("a")] }));
      assert.strictEqual(mut.pinsDigestOf({ layers: [pin("a"), pin("b")] }), mut.pinsDigestOf({ layers: [pin("b"), pin("a")] }));
    },
  },
  {
    id: "M14",
    test: "FX-DIG-E2 (payload pin in entry digest)",
    entry: "digests.ts",
    find: `export function entryDigestOf(entry: Record<string, unknown>): Digest {
  if ("entryDigest" in entry) throw new Error("entry-digest-self-embedded");
  return sha256Hex(canonicalBytes(entry));
}`,
    replace: `export function entryDigestOf(entry: Record<string, unknown>): Digest {
  if ("entryDigest" in entry) throw new Error("entry-digest-self-embedded");
  return sha256Hex(
    canonicalBytes(JSON.parse(JSON.stringify(entry, (k, v) => (k === "owner" ? undefined : v)))),
  );
}`,
    run: (mut, base) => {
      assert.notStrictEqual(base.entryDigestOf({ kind: "o", owner: "a" }), base.entryDigestOf({ kind: "o", owner: "b" }));
      assert.strictEqual(mut.entryDigestOf({ kind: "o", owner: "a" }), mut.entryDigestOf({ kind: "o", owner: "b" }));
    },
  },
];

cases.push(
  {
    id: "D1",
    test: "pinned compiled validation (wrong-phase rule)",
    entry: "diagnostics.ts",
    find: "    throw new Error(`compiled-rule-wrong-phase:${String(id)}`);",
    replace: "    void id;",
    run: (mut, base) => {
      const rule = { id: "r", phase: "release", select: {}, assert: {}, code: "c", message: "m", classification: "readiness" };
      const options = { mechanismVersion: "1", profileDigest: A64, phase: "import", readinessPolicy: "draft", compiledRules: [rule], bindings: [], severityPolicyDigest: A64 };
      assert.throws(() => base.assertValidCompiledOptions(options), /wrong-phase/);
      assert.doesNotThrow(() => mut.assertValidCompiledOptions(options));
    },
  },
  {
    id: "D2",
    test: "pinned compiled validation (duplicate compiled id)",
    entry: "diagnostics.ts",
    find: "    if (ids.has(id)) throw new Error(`compiled-rule-duplicate:${String(id)}`);",
    replace: "    void ids; void id;",
    run: (mut, base) => {
      const rule = { id: "r", phase: "import", select: {}, assert: {}, code: "c", message: "m", classification: "readiness" };
      const options = { mechanismVersion: "1", profileDigest: A64, phase: "import", readinessPolicy: "draft", compiledRules: [rule, { ...rule }], bindings: [], severityPolicyDigest: A64 };
      assert.throws(() => base.assertValidCompiledOptions(options), /duplicate/);
      assert.doesNotThrow(() => mut.assertValidCompiledOptions(options));
    },
  },
  {
    id: "D3",
    test: "native report boundary (duplicate entries)",
    entry: "diagnostics.ts",
    find: `  assertValidNativeReport(report);
  return report.entries.map((entry, index) =>`,
    replace: `  return report.entries.map((entry, index) =>`,
    run: (mut, base) => {
      const coordinate = { domain: "tree", pointer: "/a", targetId: null, provenance: "exact" };
      const entry = { code: "c", severity: "info", classification: "readiness", stage: "import", ruleId: "r", messageKey: "k", disposition: "observed", source: coordinate, result: coordinate, beforePresent: false, afterPresent: false };
      const report = { reportVersion: "2", operation: "validate", entries: [entry, { ...entry }], rawStandardFindings: [], idMap: [], artifacts: [] };
      assert.throws(() => base.reportToDiagnostics(report, (e) => e.ruleId), /duplicate-entry/);
      assert.doesNotThrow(() => mut.reportToDiagnostics(report, (e) => e.ruleId));
    },
  },
  {
    id: "D4",
    test: "native severity predicate (bogus severity value)",
    entry: "diagnostics.ts",
    find: "  nativeEffectiveSeverity(severity);",
    replace: "  void severity;",
    run: (mut, base) => {
      assert.throws(() => base.assertValidSetting({ rule: "r", severity: "bogus" }), /severity/);
      assert.doesNotThrow(() => mut.assertValidSetting({ rule: "r", severity: "bogus" }));
    },
  },
  {
    id: "A12",
    test: "per-rule bindings closure (extra key)",
    entry: "diagnostics.ts",
    find: "    for (const b of bindings) assertValidBinding(b);",
    replace: "    void bindings;",
    run: (mut, base) => {
      const rule = { id: "r", phase: "import", select: {}, assert: {}, code: "c", message: "m", classification: "readiness", bindings: [{ ownerId: "o" }] };
      const options = { mechanismVersion: "1", profileDigest: A64, phase: "import", readinessPolicy: "draft", compiledRules: [rule], bindings: [], severityPolicyDigest: A64 };
      assert.throws(() => base.assertValidCompiledOptions(options), /binding/);
      assert.doesNotThrow(() => mut.assertValidCompiledOptions(options));
    },
  },
  {
    id: "A13",
    test: "P-DELTA rename requires newName",
    entry: "digests.ts",
    find: '      throw new Error("delta-op-newname-required:rename-with-mapping");',
    replace: "      void record;",
    run: (mut, base) => {
      const shell = { base: pin("generic"), mappingRef: null, retiredFixtures: [], retiredRules: [] };
      const op = { op: "rename-with-mapping", subject: "a", declarationDigest: B64 };
      assert.throws(() => base.deltaPreimage({ ...shell, operations: [op] }), /newname-required/);
      let mutantError = null;
      try {
        mut.deltaPreimage({ ...shell, operations: [op] });
      } catch (error) {
        mutantError = error;
      }
      assert.ok(
        mutantError === null || !/newname-required/.test(mutantError.message),
        "mutant must not throw the required-newName refusal",
      );
    },
  },
  {
    id: "A14",
    test: "P-DELTA add forbids newName",
    entry: "digests.ts",
    find: "      throw new Error(`delta-op-newname-forbidden:${op.op}`);",
    replace: "      void op;",
    run: (mut, base) => {
      const shell = { base: pin("generic"), mappingRef: null, retiredFixtures: [], retiredRules: [] };
      const op = { op: "add", subject: "t", declarationDigest: B64, newName: "x" };
      assert.throws(() => base.deltaPreimage({ ...shell, operations: [op] }), /newname-forbidden/);
      let mutantError = null;
      try {
        mut.deltaPreimage({ ...shell, operations: [op] });
      } catch (error) {
        mutantError = error;
      }
      assert.ok(
        mutantError === null || !/newname-forbidden/.test(mutantError.message),
        "mutant must not throw the forbidden-newName refusal",
      );
    },
  },
  {
    id: "A1",
    test: "admission corpusAuthority tag",
    entry: "admission.ts",
    find: `      if (pb.corpusAuthority.tag !== PINNED_CORPUS_AUTHORITY_TAG) {
        return "bpmn-parity corpusAuthority tag mismatch";
      }`,
    replace: `      void pb;`,
    run: (mut, base) => {
      const forged = parityReceipt({}, { corpusAuthority: { tag: "evil-tag", manifestDigest: B64 } });
      const request = { entry: admEntry(), requiredReceipts: [PARITY_REQ], receipts: [forged] };
      refusesWith(base, request, "corpusAuthority tag mismatch");
      const verdict = mut.checkAdmission(request);
      assert.strictEqual(verdict.admitted, true, "mutant must admit the forged tag");
    },
  },
  {
    id: "A2",
    test: "admission null family binding with sheets",
    entry: "admission.ts",
    find: "        if (ruleSheetsApply(entry)) return `${receipt.receiptKind} null selection binding with rule sheets`;",
    replace: "        void entry;",
    run: (mut, base) => {
      const receipt = { receiptKind: "family-corpus", corpusDigest: B64, libraryId: "engram", libraryVersion: "1.0.0", validatorRole: "retained-check", verdict: "pass", issuedAt: "2026-10-26", evaluatedStack: evaluatedStack(), family: "ENG", fixtureDigest: B64, severityPolicyDigest: null, ruleVerdicts: [] };
      const request = { entry: admEntry(), requiredReceipts: [{ receiptKind: "family-corpus", libraryId: "engram", libraryVersion: "1.0.0" }], receipts: [receipt] };
      refusesWith(base, request, "null selection binding with rule sheets");
      const verdict = mut.checkAdmission(request);
      assert.strictEqual(verdict.admitted, true, "mutant must admit the null binding");
    },
  },
  {
    id: "A2b",
    test: "admission null mechanism binding with sheets",
    entry: "admission.ts",
    find: `  const digest = receipt.severityPolicyDigest ?? null;
  if (digest === null) {
    if (ruleSheetsApply(entry)) return \`${"${kind}"} null selection binding with rule sheets\`;
    return null;
  }`,
    replace: `  const digest = receipt.severityPolicyDigest ?? null;
  if (digest === null) {
    void entry;
    return null;
  }`,
    run: (mut, base) => {
      const receipt = { receiptKind: "mechanism-compat", corpusDigest: B64, libraryId: "bpmn-canvas", libraryVersion: "1.0.0", validatorRole: "transitional-oracle", transitionQualification: { claim: "oracle-witness", parityMatrixDigest: B64 }, verdict: "pass", issuedAt: "2026-10-26", evaluatedStack: evaluatedStack(), compatibilityMatrixVersion: "3", caseVerdicts: [{ caseId: "m1" }], severityPolicyDigest: null };
      const request = { entry: admEntry({ compatibilityMatrixVersion: "3" }), requiredReceipts: [{ receiptKind: "mechanism-compat", libraryId: "bpmn-canvas", libraryVersion: "1.0.0" }], receipts: [receipt] };
      refusesWith(base, request, "null selection binding with rule sheets");
      const verdict = mut.checkAdmission(request);
      assert.strictEqual(verdict.admitted, true, "mutant must admit the null binding");
    },
  },
  {
    id: "A3",
    test: "admission duplicate verdict rows",
    entry: "admission.ts",
    find: "    if (seen.has(v.ruleId)) return `receipt ${receiptKind} duplicate verdict for rule ${v.ruleId}`;",
    replace: "    void seen;",
    run: (mut, base) => {
      const receipt = parityReceipt({
        ruleVerdicts: [
          { ruleId: "label-required", severity: "warn", verdict: "pass", parity: "proven" },
          { ruleId: "label-required", severity: "warn", verdict: "diagnostic", parity: "proven" },
        ],
      });
      const request = { entry: admEntry(), requiredReceipts: [PARITY_REQ], receipts: [receipt] };
      refusesWith(base, request, "duplicate verdict");
      const verdict = mut.checkAdmission(request);
      assert.strictEqual(verdict.admitted, true, "mutant must admit duplicates");
    },
  },
  {
    id: "A4",
    test: "admission forged off verdict",
    entry: "admission.ts",
    find: "      return `receipt ${receiptKind} forged off verdict on rule ${v.ruleId}`;",
    replace: "      void v;",
    run: (mut, base) => {
      const receipt = parityReceipt({
        ruleVerdicts: [{ ruleId: "label-required", severity: "warn", verdict: "off", parity: "proven" }],
      });
      const request = { entry: admEntry(), requiredReceipts: [PARITY_REQ], receipts: [receipt] };
      refusesWith(base, request, "forged off verdict");
      const verdict = mut.checkAdmission(request);
      assert.strictEqual(verdict.admitted, true, "mutant must admit the forged off");
    },
  },
  {
    id: "A5",
    test: "admission effective-severity derivation (row relabelled off)",
    entry: "admission.ts",
    find: "        return `receipt ${receiptKind} selected severity mismatch on rule ${row.ruleId}`;",
    replace: "        void row;",
    run: (mut, base) => {
      const settings = warnSelection().settings;
      const entry = admEntry({
        selections: [{ ...warnSelection(), rules: [{ ruleId: "label-required", severity: "off" }] }],
      });
      const receipt = parityReceipt({
        ruleVerdicts: [{ ruleId: "label-required", severity: "off", verdict: "off", parity: "proven" }],
      });
      void settings;
      const request = { entry, requiredReceipts: [PARITY_REQ], receipts: [receipt] };
      refusesWith(base, request, "selected severity mismatch");
      const verdict = mut.checkAdmission(request);
      assert.strictEqual(verdict.admitted, true, "mutant must admit the relabelled row");
    },
  },
  {
    id: "A6",
    test: "admission owner selection digest (private parity)",
    entry: "admission.ts",
    find: `  if (receipt.proofBindings.severityPolicyDigest !== owner.severityPolicyDigest) {
    return "bpmn-parity owner selection digest mismatch";
  }`,
    replace: `  void receipt; void owner;`,
    run: (mut, base) => {
      const ownerSelection = { phase: "import", readinessPolicy: "draft", severityPolicyDigest: B64, rules: [{ ruleId: "label-required", severity: "warn" }] };
      const entry = admEntry({ selections: [], visibility: "private", ownerSelection });
      const receipt = parityReceipt(
        {},
        { severityPolicyDigest: D.severityPolicyDigestOf("import", "draft", warnSelection().settings), compiledLintEvidence: { scope: "private-reference", ownerReceiptRef: "r" } },
      );
      const request = { entry, requiredReceipts: [PARITY_REQ], receipts: [receipt] };
      refusesWith(base, request, "owner selection digest mismatch");
      const verdict = mut.checkAdmission(request);
      assert.strictEqual(verdict.admitted, true, "mutant must admit the drifted owner digest");
    },
  },
  {
    id: "A7",
    test: "admission oracle requires witness",
    entry: "admission.ts",
    find: `  if (q === undefined || q.claim !== "oracle-witness") {
    return \`receipt ${"${kind}"} names transitional-oracle without oracle-witness evidence\`;
  }
  if (!isDigest(q.parityMatrixDigest)) {
    return \`receipt ${"${kind}"} oracle-witness parityMatrixDigest malformed\`;
  }
  return null;
}`,
    replace: `  void kind;
  void q;
  return null;
}`,
    run: (mut, base) => {
      const receipt = parityReceipt({ transitionQualification: undefined });
      const request = { entry: admEntry(), requiredReceipts: [PARITY_REQ], receipts: [receipt] };
      refusesWith(base, request, "without oracle-witness evidence");
      const verdict = mut.checkAdmission(request);
      assert.strictEqual(verdict.admitted, true, "mutant must admit the witness-free oracle");
    },
  },
  {
    id: "A9",
    test: "admission retained checks carry no transition claim",
    entry: "admission.ts",
    find: "      return `receipt ${kind} carries transition qualification on a retained check`;",
    replace: "      void receipt;",
    run: (mut, base) => {
      const receipt = { receiptKind: "mem-descriptor", corpusDigest: B64, libraryId: "mem", libraryVersion: "1.0.0", validatorRole: "retained-check", transitionQualification: { claim: "oracle-witness", parityMatrixDigest: B64 }, verdict: "pass", issuedAt: "2026-10-26", evaluatedStack: evaluatedStack(), descriptorPin: pin("generic"), fixtureDigest: B64, severityPolicyDigest: null, ruleVerdicts: [] };
      const request = { entry: admEntry({ selections: [], ruleSheetPins: [] }), requiredReceipts: [{ receiptKind: "mem-descriptor", libraryId: "mem", libraryVersion: "1.0.0" }], receipts: [receipt] };
      refusesWith(base, request, "carries transition qualification on a retained check");
      const verdict = mut.checkAdmission(request);
      assert.strictEqual(verdict.admitted, true, "mutant must admit the claimed retained check");
    },
  },
  {
    id: "A10",
    test: "admission corpus digest match",
    entry: "admission.ts",
    find: `    if (receipt.corpusDigest !== entry.corpusDigest) {
      return \`required receipt ${"${receipt.receiptKind}"} corpusDigest mismatch\`;
    }`,
    replace: `    void receipt; void entry;`,
    run: (mut, base) => {
      const receipt = parityReceipt({ corpusDigest: A64 });
      const request = { entry: admEntry(), requiredReceipts: [PARITY_REQ], receipts: [receipt] };
      refusesWith(base, request, "corpusDigest mismatch");
      const verdict = mut.checkAdmission(request);
      assert.strictEqual(verdict.admitted, true, "mutant must admit the wrong corpus");
    },
  },
  {
    id: "A11",
    test: "admission transition role gate (reference required)",
    entry: "admission.ts",
    find: `    const roleProblem = checkRoleWithVerdicts(receipt, requireReference);
    if (roleProblem !== null) return roleProblem;`,
    replace: `    void receipt; void requireReference;`,
    run: (mut, base) => {
      const receipt = parityReceipt();
      const request = { entry: admEntry(), requiredReceipts: [PARITY_REQ], receipts: [receipt], requireReference: true };
      refusesWith(base, request, "requires the reference");
      const verdict = mut.checkAdmission(request);
      assert.strictEqual(verdict.admitted, true, "mutant must admit the oracle where the reference is required");
    },
  },
);

let killed = 0;
for (const c of cases) {
  const mut = await mutate(c.entry, c.find, c.replace);
  const baseNs = clean[c.entry === "digests.ts" ? "digests" : c.entry === "diagnostics.ts" ? "diagnostics" : "admission"];
  c.run(mut, baseNs, clean.diagnostics, clean.admission);
  killed += 1;
  console.log(`KILLED ${c.id} [${c.test}]`);
}
console.log(`mutants: ${killed}/${cases.length} killed`);
if (killed !== cases.length) process.exit(1);
