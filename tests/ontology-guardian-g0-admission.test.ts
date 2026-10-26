import { describe, expect, it } from "vitest";
import { checkAdmission, deriveRequirements } from "../src/ontology-guardian/admission.js";
import type { AdmissionEntry, AdmissionSelection, AdmissionRequest } from "../src/ontology-guardian/admission.js";
import type { CompiledLintOptions, Receipt } from "../src/ontology-guardian/catalog.js";
import { pinsDigestOf, severityPolicyDigestOf } from "../src/ontology-guardian/digests.js";

const A = "a".repeat(64), B = "b".repeat(64);
const pin = (id: string, version = "1.0.0", contentDigest = A) => ({ id, version, contentDigest });
const rule = { id: "r", phase: "import", select: { type: "task" }, assert: { min: 1 }, code: "required", message: "required.message", classification: "readiness", bindings: [{ ownerId: "rule", role: "subject", targetId: "task" }] };

/** Independent pinned producer selection. The receipt and entry get distinct
 * copies: changing evidence cannot change the expected selection by aliasing. */
function selection(policy = "draft", severity: string | number = "warn", body = false): AdmissionSelection {
  const settings = [{ rule: body ? "profile:r" : "label-required", severity, classification: "readiness" }];
  const digest = severityPolicyDigestOf("import", policy, settings);
  const compiled: CompiledLintOptions = {
    mechanismVersion: "1", profileDigest: A, phase: "import", readinessPolicy: policy,
    compiledRules: body && severity !== "off" ? [structuredClone(rule)] : [],
    bindings: [{ ownerId: "owner", role: "target", targetId: "task" }], severityPolicyDigest: digest,
  };
  return { phase: "import", readinessPolicy: policy, settings, severityPolicyDigest: digest,
    rules: [{ ruleId: body ? "r" : "label-required", severity: typeof severity === "number" ? ["off", "warn", "error", "info"][severity]! : severity }], expectedCompiledOptions: compiled };
}

function fixture(kind: Receipt["receiptKind"] = "bpmn-parity", privateRun = false, body = false): AdmissionRequest {
  const parity = ["bpmn-parity", "bpmn-bijection", "mechanism-compat"].includes(kind);
  const family = kind === "family-corpus" ? "ENG" : kind === "h2a-vocabulary" ? "H2A" : kind === "mem-descriptor" ? "MEM" : kind === "bpmn-bijection" ? "DIA" : kind === "mechanism-compat" ? "MECH" : "D2D";
  const sheetless = ["h2a-vocabulary", "mem-descriptor"].includes(kind);
  const selected = selection("draft", family === "ENG" ? "warning" : "warn", body);
  const semantics = { contentDigest: A, pinsDigest: B, resultDigest: A };
  const entry: AdmissionEntry = {
    family, artifactKind: kind === "theme-invariance" ? "theme" : kind === "contract-verdict" ? "contract" : kind === "bpmn-bijection" ? "base" : kind === "mechanism-compat" ? "mechanism" : "profile",
    profileShape: family === "ENG" ? "engram-profile" : family === "H2A" ? "timing-reference" : family === "MEM" || family === "MECH" ? "mechanism-descriptor" : "diagram-profile",
    generatedBpmn: kind === "bpmn-bijection",
    qualificationScope: { libraries: parity ? [{ id: "canvas", version: "1.0.0" }, { id: "twin", version: "2.0.0" }] : [{ id: "validator", version: "1.0.0" }],
      proofSets: parity ? ["published-corpus"] : [], selections: [{ phase: "import", readinessPolicy: "draft" }],
      ...(kind === "bpmn-bijection" ? { bijectionLibrary: { id: "bijection", version: "3.0.0" } } : {}) },
    profilePin: pin("profile"), stack: [pin("profile")], pinsDigest: pinsDigestOf({ layers: [pin("profile")] }),
    resultEvidence: { evidenceState: "resolved", digest: A }, corpusDigest: B,
    visibility: privateRun ? "private" : "public", ruleSheetPins: sheetless ? [] : [pin("sheet")], ruleSheetRuleIds: sheetless ? [] : [selected.rules.map((r) => r.ruleId)],
    selections: privateRun || sheetless ? [] : [selected],
    ...(privateRun && !sheetless ? { ownerSelection: { phase: "import", readinessPolicy: "draft", severityPolicyDigest: selected.severityPolicyDigest, rules: structuredClone(selected.rules), ownerReceiptRef: "owner:verified-run" } } : {}),
    sourceRevision: "revision-1", contractSchemaPin: pin("schema"), compatibilityMatrixVersion: "3",
    themeBefore: semantics, themeAfter: structuredClone(semantics),
  };
  const receipts = deriveRequirements(entry).map((req): Receipt => {
    const common = { receiptKind: req.receiptKind, libraryId: req.libraryId, libraryVersion: req.libraryVersion,
      corpusDigest: B, validatorRole: "retained-check", verdict: "pass", issuedAt: "2026-10-26",
      evaluatedStack: { stack: [pin("profile")], pinsDigest: entry.pinsDigest, resultEvidence: { evidenceState: "resolved", digest: A } } };
    const digest = sheetless ? null : selected.severityPolicyDigest;
    const verdicts = sheetless ? [] : selected.rules.map((r) => ({ ...r, verdict: r.severity === "off" ? "off" : "pass", parity: "proven" }));
    switch (req.receiptKind) {
      case "bpmn-parity": return { ...common, validatorRole: "transitional-oracle", transitionQualification: { claim: "oracle-witness", parityMatrixDigest: B },
        proofBindings: { proofSet: req.proofSet, corpusAuthority: { tag: "profile-corpus-v1.0.0", manifestDigest: B }, profilePin: pin("profile"), ruleSheetPins: [pin("sheet")], severityPolicyDigest: digest,
          compiledLintEvidence: privateRun ? { scope: "private-reference", ownerReceiptRef: "owner:verified-run" } : { scope: "public", settings: structuredClone(selected.settings), compiledOptions: structuredClone(selected.expectedCompiledOptions) } }, ruleVerdicts: verdicts } as Receipt;
      case "family-corpus": return { ...common, family, fixtureDigest: B, severityPolicyDigest: digest, ruleVerdicts: verdicts } as Receipt;
      case "h2a-vocabulary": return { ...common, protocolPin: pin("profile"), sourceRevision: "revision-1", fixtureDigest: B, severityPolicyDigest: null, ruleVerdicts: [] } as Receipt;
      case "mem-descriptor": return { ...common, descriptorPin: pin("profile"), fixtureDigest: B, severityPolicyDigest: null, ruleVerdicts: [] } as Receipt;
      case "bpmn-bijection": return { ...common, descriptorCoverage: { covered: 4, total: 4 }, roundTripEvidenceRef: "round-trip", moddleTestPin: pin("bpmn-moddle"), severityPolicyDigest: digest } as Receipt;
      case "mechanism-compat": return { ...common, compatibilityMatrixVersion: "3", caseVerdicts: [{ caseId: "c" }], severityPolicyDigest: digest } as Receipt;
      case "contract-verdict": return { ...common, schemaPin: pin("schema"), compatibilityMatrixVersion: "3", caseVerdicts: [{ caseId: "c" }], severityPolicyDigest: digest } as Receipt;
      case "theme-invariance": return { ...common, styledProfilePin: pin("profile"), semanticDigestsBefore: structuredClone(semantics), semanticDigestsAfter: structuredClone(semantics), severityPolicyDigest: digest } as Receipt;
    }
  });
  return { entry, receipts };
}

// Dynamic test mutations model untrusted runtime input, beyond TypeScript's
// contracts. Each row starts by proving the complete fixture admits.
function rejects(name: string, kind: Receipt["receiptKind"], mutate: (request: any, receipt: any) => void, privateRun = false, body = false): void {
  it(name, () => {
    const request = fixture(kind, privateRun, body);
    expect(checkAdmission(request)).toEqual({ admitted: true });
    const changed = structuredClone(request);
    const receipt = changed.receipts.find((r) => r.receiptKind === kind)!;
    mutate(changed, receipt);
    expect(checkAdmission(changed).admitted).toBe(false);
  });
}

const kinds: Receipt["receiptKind"][] = ["bpmn-parity", "bpmn-bijection", "family-corpus", "h2a-vocabulary", "mem-descriptor", "mechanism-compat", "contract-verdict", "theme-invariance"];
describe("§5.5 entry-derived exhaustive receipt requirements", () => {
  for (const kind of kinds) {
    for (const privateRun of [false, true]) {
      const scope = privateRun ? "private" : "public";
      it(`${kind} ${scope} complete evidence admits`, () => expect(checkAdmission(fixture(kind, privateRun))).toEqual({ admitted: true }));
      rejects(`${kind} ${scope} required receipt cannot be erased by an empty caller array`, kind, (q) => { q.requiredReceipts = []; q.receipts = []; }, privateRun);
      rejects(`${kind} ${scope} wrong library refuses`, kind, (_, r) => { r.libraryId = "foreign"; }, privateRun);
      rejects(`${kind} ${scope} wrong library version refuses`, kind, (_, r) => { r.libraryVersion = "99.0.0"; }, privateRun);
      rejects(`${kind} ${scope} failing corpus refuses`, kind, (_, r) => { r.verdict = "fail"; }, privateRun);
      rejects(`${kind} ${scope} unresolved result refuses`, kind, (_, r) => { r.evaluatedStack.resultEvidence = { evidenceState: "unresolved" }; }, privateRun);
      rejects(`${kind} ${scope} wrong result refuses`, kind, (_, r) => { r.evaluatedStack.resultEvidence.digest = B; }, privateRun);
      rejects(`${kind} ${scope} wrong corpus refuses`, kind, (_, r) => { r.corpusDigest = A; }, privateRun);
      rejects(`${kind} ${scope} wrong stack refuses`, kind, (_, r) => { r.evaluatedStack.stack[0].id = "other"; }, privateRun);
      rejects(`${kind} ${scope} wrong pins digest refuses`, kind, (_, r) => { r.evaluatedStack.pinsDigest = B; }, privateRun);
    }
  }
  rejects("incomplete library description refuses", "bpmn-parity", (q) => { q.entry.qualificationScope.libraries = []; });
  rejects("one implementing library cannot describe BPMN qualification", "bpmn-parity", (q) => { q.entry.qualificationScope.libraries.pop(); });
  rejects("duplicate implementing library refuses", "bpmn-parity", (q) => { q.entry.qualificationScope.libraries[1] = q.entry.qualificationScope.libraries[0]; });
  rejects("empty proof claim description refuses", "bpmn-parity", (q) => { q.entry.qualificationScope.proofSets = []; });
  rejects("empty qualification selection refuses", "bpmn-parity", (q) => { q.entry.qualificationScope.selections = []; });
  rejects("missing second library receipt refuses", "bpmn-parity", (q) => { q.receipts.pop(); });
  rejects("both proof sets need distinct receipts", "bpmn-parity", (q) => { q.entry.qualificationScope.proofSets.push("local-expectations"); });
  rejects("a repeated receipt cannot satisfy another library", "bpmn-parity", (q) => { q.receipts[1] = q.receipts[0]; });
  rejects("erased rule rows and verdicts refuse", "bpmn-parity", (q) => { q.entry.selections[0].rules = []; q.receipts.forEach((r: any) => { r.ruleVerdicts = []; }); });
  rejects("settings outside declared sheet IDs refuse", "bpmn-parity", (q) => { q.entry.ruleSheetRuleIds = [[]]; q.entry.selections[0].rules = []; });
  rejects("native settings cannot introduce an unlisted obligation", "bpmn-parity", (q) => {
    const s = q.entry.selections[0]; s.settings.push({ rule: "foreign", severity: "warn" });
    s.severityPolicyDigest = severityPolicyDigestOf(s.phase, s.readinessPolicy, s.settings); s.expectedCompiledOptions.severityPolicyDigest = s.severityPolicyDigest;
    q.receipts.forEach((r: any) => { r.proofBindings.severityPolicyDigest = s.severityPolicyDigest; r.proofBindings.compiledLintEvidence.settings = structuredClone(s.settings); r.proofBindings.compiledLintEvidence.compiledOptions = structuredClone(s.expectedCompiledOptions); });
  });
  rejects("duplicate selected rows refuse", "bpmn-parity", (q) => { q.entry.selections[0].rules.push(q.entry.selections[0].rules[0]); });
  rejects("duplicate effective settings refuse", "bpmn-parity", (q) => { q.entry.selections[0].settings.push(q.entry.selections[0].settings[0]); });
  rejects("missing sheet description refuses", "bpmn-parity", (q) => { q.entry.ruleSheetRuleIds = []; });
  rejects("duplicate selection scope refuses", "bpmn-parity", (q) => { q.entry.qualificationScope.selections.push(q.entry.qualificationScope.selections[0]); });
  rejects("public selection scope cannot be omitted", "bpmn-parity", (q) => { q.entry.selections = []; });
  rejects("selection cannot change phase alone", "bpmn-parity", (q) => { q.entry.selections[0].phase = "release"; });
});

describe("§5.5 native severities, verdicts and complete native evidence", () => {
  for (const kind of ["bpmn-parity", "family-corpus"] as const) {
    rejects(`${kind} off relabelling refuses`, kind, (q, r) => { q.entry.selections[0].rules[0].severity = "off"; r.ruleVerdicts[0].severity = "off"; r.ruleVerdicts[0].verdict = "off"; });
    rejects(`${kind} missing verdict refuses`, kind, (_, r) => { r.ruleVerdicts = []; });
    rejects(`${kind} duplicate verdict refuses`, kind, (_, r) => { r.ruleVerdicts.push(r.ruleVerdicts[0]); });
    rejects(`${kind} unknown verdict rule refuses`, kind, (_, r) => { r.ruleVerdicts[0].ruleId = "foreign"; });
    rejects(`${kind} forged off verdict refuses`, kind, (_, r) => { r.ruleVerdicts[0].verdict = "off"; });
    rejects(`${kind} unevaluated rule refuses`, kind, (_, r) => { r.ruleVerdicts[0].verdict = "not-evaluated"; });
    rejects(`${kind} wrong verdict severity refuses`, kind, (_, r) => { r.ruleVerdicts[0].severity = "error"; });
    rejects(`${kind} study disposition mismatch refuses`, kind, (_, r) => { r.ruleVerdicts[0].studyDisposition = "N9"; });
    rejects(`${kind} stale whole settings digest refuses`, kind, (q) => { q.entry.selections[0].settings[0].severity = "error"; });
  }
  for (const field of ["select", "assert", "code", "message", "classification", "repairRecipe", "bindings"] as const) {
    rejects(`compiled rule ${field} authenticated against expected native selection`, "bpmn-parity", (_, r) => { r.proofBindings.compiledLintEvidence.compiledOptions.compiledRules[0][field] = field === "bindings" ? [{ ownerId: "x", role: "y", targetId: "z" }] : field === "select" || field === "assert" ? { changed: true } : "changed"; }, false, true);
  }
  rejects("compiled native binding snapshot authenticated", "bpmn-parity", (_, r) => { r.proofBindings.compiledLintEvidence.compiledOptions.bindings[0].targetId = "unrelated"; });
  rejects("unrelated compiled rule cannot be inserted", "bpmn-parity", (_, r) => { r.proofBindings.compiledLintEvidence.compiledOptions.compiledRules.push(structuredClone(rule)); });
  rejects("expected native selection required", "bpmn-parity", (q) => { delete q.entry.selections[0].expectedCompiledOptions; });
  rejects("native compiled phase checked", "bpmn-parity", (_, r) => { r.proofBindings.compiledLintEvidence.compiledOptions.phase = "release"; });
  rejects("native compiled settings checked", "bpmn-parity", (_, r) => { r.proofBindings.compiledLintEvidence.settings[0].severity = "error"; });
  rejects("native profile digest checked", "bpmn-parity", (_, r) => { r.proofBindings.compiledLintEvidence.compiledOptions.profileDigest = B; });
  rejects("receipt profile pin checked", "bpmn-parity", (_, r) => { r.proofBindings.profilePin.id = "other"; });
  rejects("receipt rule sheet pins checked", "bpmn-parity", (_, r) => { r.proofBindings.ruleSheetPins = []; });
  rejects("native compiled policy digest checked", "bpmn-parity", (_, r) => { r.proofBindings.compiledLintEvidence.compiledOptions.severityPolicyDigest = B; });
  rejects("proof-set binding checked", "bpmn-parity", (_, r) => { r.proofBindings.proofSet = "local-expectations"; });
  rejects("corpus authority tag checked", "bpmn-parity", (_, r) => { r.proofBindings.corpusAuthority.tag = "other"; });
  rejects("corpus authority manifest checked", "bpmn-parity", (_, r) => { r.proofBindings.corpusAuthority.manifestDigest = A; });
  it("numeric effective severity and profile-prefixed settings admit", () => {
    const q: any = fixture("bpmn-parity", false, true), s = selection("draft", 2, true);
    q.entry.selections = [s];
    for (const r of q.receipts) { r.proofBindings.severityPolicyDigest = s.severityPolicyDigest; r.proofBindings.compiledLintEvidence = { scope: "public", compiledOptions: structuredClone(s.expectedCompiledOptions), settings: structuredClone(s.settings) }; r.ruleVerdicts = [{ ruleId: "r", severity: "error", verdict: "pass", parity: "proven" }]; }
    expect(checkAdmission(q)).toEqual({ admitted: true });
  });
  it("native off selection admits exactly its disabled verdict", () => {
    const q: any = fixture(), s = selection("draft", "off"); q.entry.selections = [s];
    for (const r of q.receipts) { r.proofBindings.severityPolicyDigest = s.severityPolicyDigest; r.proofBindings.compiledLintEvidence = { scope: "public", compiledOptions: structuredClone(s.expectedCompiledOptions), settings: structuredClone(s.settings) }; r.ruleVerdicts[0] = { ruleId: "label-required", severity: "off", verdict: "off", parity: "proven" }; }
    expect(checkAdmission(q)).toEqual({ admitted: true });
    q.receipts[0].ruleVerdicts[0].verdict = "pass"; expect(checkAdmission(q).admitted).toBe(false);
  });
});

describe("§5.5 all policy bindings, private references and family evidence", () => {
  for (const kind of kinds.filter((k) => !["h2a-vocabulary", "mem-descriptor"].includes(k))) {
    rejects(`${kind} null policy with sheets refuses`, kind, (_, r) => { if (r.proofBindings) r.proofBindings.severityPolicyDigest = null; else r.severityPolicyDigest = null; if (r.ruleVerdicts) r.ruleVerdicts = []; }, false);
    if (!["h2a-vocabulary", "mem-descriptor"].includes(kind)) {
      rejects(`${kind} public settings must recompute`, kind, (q) => { q.entry.selections[0].settings[0].classification = "advisory"; });
      rejects(`${kind} private owner selection required`, kind, (q) => { delete q.entry.ownerSelection; }, true);
      rejects(`${kind} private owner digest must match`, kind, (q) => { q.entry.ownerSelection.severityPolicyDigest = B; }, true);
    }
  }
  for (const kind of ["h2a-vocabulary", "mem-descriptor"] as const) rejects(`${kind} sheetless selection binding must be null`, kind, (_, r) => { r.severityPolicyDigest = B; });
  rejects("private evidence cannot use public scope", "bpmn-parity", (_, r) => { r.proofBindings.compiledLintEvidence = { scope: "public", compiledOptions: selection().expectedCompiledOptions, settings: selection().settings }; }, true);
  rejects("private evidence reference cannot be empty", "bpmn-parity", (_, r) => { r.proofBindings.compiledLintEvidence.ownerReceiptRef = ""; }, true);
  rejects("private evidence reference must name expected owner run", "bpmn-parity", (_, r) => { r.proofBindings.compiledLintEvidence.ownerReceiptRef = "unrelated"; }, true);
  rejects("private selection rows complete", "family-corpus", (q) => { q.entry.ownerSelection.rules = []; }, true);
  rejects("private entry cannot expose public selections", "bpmn-parity", (q) => { q.entry.selections = [selection()]; }, true);
  rejects("family literal matches entry", "family-corpus", (_, r) => { r.family = "TRK"; });
  for (const kind of ["family-corpus", "h2a-vocabulary", "mem-descriptor"] as const) rejects(`${kind} fixture manifest checked`, kind, (_, r) => { r.fixtureDigest = A; });
  rejects("h2a provenance revision checked", "h2a-vocabulary", (_, r) => { r.sourceRevision = "drift"; });
  rejects("h2a protocol pin checked", "h2a-vocabulary", (_, r) => { r.protocolPin.id = "drift"; });
  rejects("mem descriptor pin checked", "mem-descriptor", (_, r) => { r.descriptorPin.id = "drift"; });
  for (const kind of ["h2a-vocabulary", "mem-descriptor"] as const) rejects(`${kind} retained role required`, kind, (_, r) => { r.validatorRole = "transitional-oracle"; r.transitionQualification = { claim: "oracle-witness", parityMatrixDigest: B }; });
  rejects("bijection round trip reference required", "bpmn-bijection", (_, r) => { r.roundTripEvidenceRef = ""; });
  rejects("bijection coverage complete", "bpmn-bijection", (_, r) => { r.descriptorCoverage.covered--; });
  rejects("bijection coverage cannot be negative", "bpmn-bijection", (_, r) => { r.descriptorCoverage = { covered: -1, total: -1 }; });
  rejects("bijection test dependency digest checked", "bpmn-bijection", (_, r) => { r.moddleTestPin.contentDigest = "bad"; });
  for (const kind of ["mechanism-compat", "contract-verdict"] as const) rejects(`${kind} matrix version checked`, kind, (_, r) => { r.compatibilityMatrixVersion = "4"; });
  rejects("contract schema pin checked", "contract-verdict", (_, r) => { r.schemaPin.id = "other"; });
  rejects("theme styled profile checked", "theme-invariance", (_, r) => { r.styledProfilePin.id = "other"; });
  for (const field of ["contentDigest", "pinsDigest", "resultDigest"] as const) {
    rejects(`theme invariance ${field} checked`, "theme-invariance", (_, r) => { r.semanticDigestsAfter[field] = field === "pinsDigest" ? A : B; });
    rejects(`theme expected ${field} evidence checked`, "theme-invariance", (q) => { q.entry.themeBefore[field] = q.entry.themeAfter[field] = field === "pinsDigest" ? A : B; });
  }
});

describe("§5.5 exact pins and transition qualification", () => {
  for (const version of ["latest", "next", "^1.0.0", "~1.0.0", "1.x", ">=1", "1.0.0 || 2.0.0", "*"]) {
    rejects(`floating entry profile ${version} refuses`, "bpmn-parity", (q, r) => { q.entry.profilePin.version = r.proofBindings.profilePin.version = version; });
    rejects(`floating stack ${version} refuses`, "bpmn-parity", (q) => { q.entry.stack[0].version = version; q.receipts.forEach((r: any) => { r.evaluatedStack.stack[0].version = version; }); });
    rejects(`floating sheet ${version} refuses`, "bpmn-parity", (q, r) => { q.entry.ruleSheetPins[0].version = r.proofBindings.ruleSheetPins[0].version = version; });
  }
  rejects("pin closure refuses extra fields", "bpmn-parity", (q) => { q.entry.profilePin.extra = true; });
  rejects("entry stack pin fields are closed", "bpmn-parity", (q) => { q.entry.stack[0].invented = true; });
  rejects("empty stack refuses", "bpmn-parity", (q) => { q.entry.stack = []; });
  rejects("duplicate stack pin refuses", "bpmn-parity", (q) => { q.entry.stack.push(q.entry.stack[0]); });
  rejects("malformed entry digest refuses", "bpmn-parity", (q) => { q.entry.pinsDigest = "bad"; });
  rejects("unresolved entry refuses", "bpmn-parity", (q) => { q.entry.resultEvidence = { evidenceState: "unresolved" }; });
  rejects("malformed resolved receipt digest refuses", "bpmn-parity", (_, r) => { r.evaluatedStack.resultEvidence.digest = "bad"; });
  rejects("oracle witness required", "bpmn-parity", (_, r) => { delete r.transitionQualification; });
  rejects("oracle matrix digest validated", "bpmn-parity", (_, r) => { r.transitionQualification.parityMatrixDigest = "bad"; });
  rejects("retained role cannot carry qualification", "family-corpus", (_, r) => { r.transitionQualification = { claim: "oracle-witness", parityMatrixDigest: B }; });
  rejects("reference role needs qualified evidence", "bpmn-parity", (_, r) => { r.validatorRole = "qualified-ds-execution"; });
  rejects("reference required gate refuses oracle", "bpmn-parity", (q) => { q.requireReference = true; });
  for (const bad of ["pin", "matrix", "gate", "parity"]) rejects(`reference ${bad} must be qualified`, "bpmn-parity", (_, r) => {
    r.validatorRole = "qualified-ds-execution"; r.transitionQualification = { claim: "reference-qualified", parityMatrixDigest: bad === "matrix" ? "bad" : B, qualifiedExecutorPin: pin("executor", bad === "pin" ? "latest" : "1.0.0"), gateEvidenceRef: bad === "gate" ? "" : "release:GO" }; if (bad === "parity") r.ruleVerdicts[0].parity = "open";
  });
  it("qualified reference admits with complete evidence", () => {
    const q: any = fixture(); q.requireReference = true;
    q.receipts.forEach((r: any) => { r.validatorRole = "qualified-ds-execution"; r.transitionQualification = { claim: "reference-qualified", parityMatrixDigest: B, qualifiedExecutorPin: pin("executor"), gateEvidenceRef: "release:GO" }; });
    expect(checkAdmission(q)).toEqual({ admitted: true });
  });
  it("set matching is independent of receipt and qualification order", () => {
    const q: any = fixture(), second: any = fixture(); const selected = selection("accept", "error");
    q.entry.qualificationScope.selections.push({ phase: "import", readinessPolicy: "accept" }); q.entry.selections.push(selected);
    second.receipts.forEach((r: any) => { r.proofBindings.severityPolicyDigest = selected.severityPolicyDigest; r.proofBindings.compiledLintEvidence = { scope: "public", compiledOptions: structuredClone(selected.expectedCompiledOptions), settings: structuredClone(selected.settings) }; r.ruleVerdicts[0].severity = "error"; });
    q.receipts.push(...second.receipts);
    for (let i = 0; i < 2; i++) { q.receipts.reverse(); q.entry.qualificationScope.selections.reverse(); q.entry.qualificationScope.libraries.reverse(); expect(checkAdmission(q)).toEqual({ admitted: true }); }
    q.receipts.pop(); expect(checkAdmission(q).admitted).toBe(false);
  });
});

it("private receipt matching covers every owner selection scope", () => {
  const q: any = fixture("bpmn-parity", true), s = selection("accept", "error");
  q.entry.ownerSelections = [q.entry.ownerSelection, { phase: s.phase, readinessPolicy: s.readinessPolicy, severityPolicyDigest: s.severityPolicyDigest, rules: s.rules, ownerReceiptRef: "owner:accept-run" }];
  delete q.entry.ownerSelection;
  q.entry.qualificationScope.selections.push({ phase: "import", readinessPolicy: "accept" });
  const second = structuredClone(q.receipts);
  for (const r of second) { r.proofBindings.severityPolicyDigest = s.severityPolicyDigest; r.proofBindings.compiledLintEvidence.ownerReceiptRef = "owner:accept-run"; r.ruleVerdicts[0].severity = "error"; }
  q.receipts.push(...second);
  expect(checkAdmission(q)).toEqual({ admitted: true });
  q.receipts.reverse(); q.entry.ownerSelections.reverse(); expect(checkAdmission(q)).toEqual({ admitted: true });
  q.receipts.pop(); expect(checkAdmission(q).admitted).toBe(false);
});
