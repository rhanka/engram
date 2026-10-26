// §5.5 admission gate as a pure function. Refuses unresolved or mismatching
// result evidence explicitly; never falls back to latest.
import { canonicalBytes } from "./canonical.js";
import { severityPolicyDigestOf } from "./digests.js";
import {
  assertValidCompiledOptions,
  assertValidSetting,
  nativeEffectiveSeverity,
} from "./diagnostics.js";
import { PINNED_CORPUS_AUTHORITY_TAG } from "./catalog.js";
import { isDigest } from "./types.js";
import type { CompiledSetting } from "./diagnostics.js";
import type { ArtifactKind, Digest, DigestEvidence, Pin, ProfileShape } from "./types.js";
import type { CompiledLintOptions, Receipt, RuleVerdict } from "./catalog.js";

export interface AdmissionSelection {
  readonly phase: string;
  readonly readinessPolicy: string;
  /** Whole composed selection, native effective-setting order. */
  readonly settings: readonly CompiledSetting[];
  readonly severityPolicyDigest: Digest;
  readonly rules: readonly { readonly ruleId: string; readonly severity: string; readonly studyDisposition?: string }[];
  /** Independently supplied native selection, including full bodies and binding snapshot. */
  readonly expectedCompiledOptions?: CompiledLintOptions;
}

/**
 * Owner-side selection binding for private entries. Carries the selected
 * (phase, readinessPolicy), its policy digest and the effective rule rows —
 * never the settings themselves, which stay owner-side (§5.5).
 */
export interface OwnerSelectionBinding {
  readonly ownerReceiptRef: string;
  readonly phase: string;
  readonly readinessPolicy: string;
  readonly severityPolicyDigest: Digest;
  readonly rules: readonly { readonly ruleId: string; readonly severity: string; readonly studyDisposition?: string }[];
}

export type AdmissionFamily = "DIA" | "MECH" | "D2D" | "ENG" | "TRK" | "H2A" | "HRN" | "RPK" | "MEM" | "EXT";
export interface QualificationScope {
  readonly libraries: readonly { readonly id: string; readonly version: string }[];
  readonly proofSets: readonly ("published-corpus" | "local-expectations")[];
  readonly selections: readonly { readonly phase: string; readonly readinessPolicy: string }[];
  readonly bijectionLibrary?: { readonly id: string; readonly version: string };
}

/** Admission projection plus the independently resolved qualification context.
 * These context fields are not additions to the serialized §5.3 payload. */
export interface AdmissionEntry {
  readonly family: AdmissionFamily;
  readonly artifactKind: ArtifactKind;
  readonly profileShape: ProfileShape;
  readonly generatedBpmn: boolean;
  readonly qualificationScope: QualificationScope;
  /** Unit sheet IDs, in the same order as ruleSheetPins. */
  readonly ruleSheetRuleIds: readonly (readonly string[])[];
  readonly stack: readonly Pin[];
  readonly pinsDigest: Digest;
  readonly resultEvidence: DigestEvidence;
  readonly profilePin: Pin;
  readonly corpusDigest: Digest;
  readonly selections: readonly AdmissionSelection[];
  readonly ruleSheetPins: readonly Pin[];
  readonly visibility: "public" | "private";
  /** Required for private entries admitted through owner-side evidence. */
  readonly ownerSelection?: OwnerSelectionBinding;
  readonly ownerSelections?: readonly OwnerSelectionBinding[];
  readonly compatibilityMatrixVersion?: string;
  /** Expected provenance source revision for `h2a-vocabulary` bindings. */
  readonly sourceRevision?: string;
  /** Expected contract schema pin for `contract-verdict` bindings. */
  readonly contractSchemaPin?: Pin;
  readonly themeBefore?: { readonly contentDigest: Digest; readonly pinsDigest: Digest; readonly resultDigest: Digest };
  readonly themeAfter?: { readonly contentDigest: Digest; readonly pinsDigest: Digest; readonly resultDigest: Digest };
}

/**
 * One required library receipt (§5.4): the gate binds each requirement to
 * exactly one receipt by implementing library, version, proof set and
 * qualification scope. A single receipt never satisfies two requirements.
 */
export interface AdmissionRequirement {
  readonly receiptKind: Receipt["receiptKind"];
  readonly libraryId: string;
  readonly libraryVersion: string;
  readonly proofSet?: "published-corpus" | "local-expectations";
  readonly phase?: string;
  readonly readinessPolicy?: string;
}

export interface AdmissionRequest {
  readonly entry: AdmissionEntry;
  readonly receipts: readonly Receipt[];
  /** True once the transition gate requires the qualified reference role. */
  readonly requireReference?: boolean;
}

export type AdmissionVerdict =
  | { readonly admitted: true }
  | { readonly admitted: false; readonly code: "missing-receipt"; readonly reason: string };

/** §1.3 exact numeric versions (including pinned prereleases), never tags/ranges. */
export function isExactVersion(value: unknown): value is string {
  return typeof value === "string" && /^(0|[1-9][0-9]*)(\.(0|[1-9][0-9]*)){0,2}(-[0-9A-Za-z]+([.-][0-9A-Za-z]+)*)?(\+[0-9A-Za-z]+([.-][0-9A-Za-z]+)*)?$/.test(value);
}

const FAMILY_RECEIPTS = {
  DIA: "family-corpus", MECH: "bpmn-parity", D2D: "bpmn-parity", ENG: "family-corpus",
  TRK: "family-corpus", H2A: "h2a-vocabulary", HRN: "family-corpus", RPK: "family-corpus",
  MEM: "mem-descriptor", EXT: "family-corpus",
} as const;

/** Required entry bindings for each row of §5.5; all rows also bind the
 * library/version, corpus, stack, resolved result, policy and transition role. */
const ADMISSION_RULES = {
  "bpmn-parity": [], "bpmn-bijection": [], "family-corpus": [],
  "h2a-vocabulary": ["sourceRevision"], "mem-descriptor": [],
  "mechanism-compat": ["compatibilityMatrixVersion"],
  "contract-verdict": ["contractSchemaPin", "compatibilityMatrixVersion"],
  "theme-invariance": ["themeBefore", "themeAfter"],
} as const;

function ownerSelectionsOf(entry: AdmissionEntry): readonly OwnerSelectionBinding[] {
  if (entry.ownerSelections !== undefined && entry.ownerSelection !== undefined) throw new Error("ambiguous owner selection context");
  return entry.ownerSelections ?? (entry.ownerSelection === undefined ? [] : [entry.ownerSelection]);
}

function usesBpmn(entry: AdmissionEntry): boolean {
  return entry.family === "MECH" || entry.family === "D2D" || entry.generatedBpmn;
}

/** Full requirements derive from entry classification and its resolved scope.
 * There is no caller-supplied array of receipt kinds that can erase a row. */
export function deriveRequirements(entry: AdmissionEntry): readonly AdmissionRequirement[] {
  if (!Object.hasOwn(FAMILY_RECEIPTS, entry.family) || typeof entry.generatedBpmn !== "boolean") throw new Error("entry family/generation unverified");
  if (entry.generatedBpmn && (entry.family !== "DIA" || entry.artifactKind !== "base")) throw new Error("invalid generated base scope");
  const scope = entry.qualificationScope;
  if (!scope || !Array.isArray(scope.libraries) || scope.libraries.length === 0 || !Array.isArray(scope.proofSets) || !Array.isArray(scope.selections) || scope.selections.length === 0) throw new Error("incomplete qualification scope");
  const kinds: Receipt["receiptKind"][] = entry.artifactKind === "theme" ? ["theme-invariance"]
    : entry.artifactKind === "contract" ? ["contract-verdict"]
    : [entry.generatedBpmn ? "bpmn-parity" : FAMILY_RECEIPTS[entry.family]];
  if (!["mechanism", "base", "profile", "theme", "corpus", "contract"].includes(entry.artifactKind)) throw new Error("unknown artifact kind");
  if (entry.family === "MECH" && ["mechanism", "corpus"].includes(entry.artifactKind)) kinds.push("mechanism-compat");
  if (entry.generatedBpmn) kinds.push("bpmn-bijection");
  const parity = kinds.includes("bpmn-parity");
  if (parity && (scope.libraries.length < 2 || scope.proofSets.length === 0)) throw new Error("both implementing libraries and every claimed proof set required");
  if (!parity && scope.proofSets.length !== 0) throw new Error("foreign BPMN proof scope");
  if (new Set(scope.proofSets).size !== scope.proofSets.length || scope.proofSets.some((p) => p !== "published-corpus" && p !== "local-expectations")) throw new Error("invalid proof sets");
  const libraries = new Set<string>();
  for (const library of scope.libraries) {
    if (!library.id || !isExactVersion(library.version) || libraries.has(library.id)) throw new Error("invalid or duplicate implementing library");
    libraries.add(library.id);
  }
  const selections = new Set<string>();
  for (const selection of scope.selections) {
    if (!selection.phase || !selection.readinessPolicy) throw new Error("incomplete selection scope");
    const key = canonicalBytes(selection);
    if (selections.has(key)) throw new Error("duplicate selection scope");
    selections.add(key);
  }
  const requirements: AdmissionRequirement[] = [];
  for (const receiptKind of kinds) {
    for (const binding of ADMISSION_RULES[receiptKind]) {
      if (entry[binding] === undefined || entry[binding] === "") throw new Error(`missing entry binding ${binding}`);
    }
    const producers = receiptKind === "bpmn-bijection" ? [scope.bijectionLibrary] : scope.libraries;
    for (const producer of producers) {
      if (!producer || !producer.id || !isExactVersion(producer.version)) throw new Error("incomplete bijection library pin");
      for (const selection of ruleSheetsApply(entry) ? scope.selections : [{}]) {
        for (const proofSet of receiptKind === "bpmn-parity" ? scope.proofSets : [undefined]) {
          requirements.push({ receiptKind, libraryId: producer.id, libraryVersion: producer.version,
            ...(proofSet === undefined ? {} : { proofSet }),
            ...(ruleSheetsApply(entry) ? selection : {}) });
        }
      }
    }
  }
  return requirements;
}

/** Check complete sheet obligations before any receipt is matched. */
function checkSelections(entry: AdmissionEntry): string | null {
  if (entry.visibility !== "public" && entry.visibility !== "private") return "invalid visibility";
  if (entry.ruleSheetRuleIds.length !== entry.ruleSheetPins.length) return "incomplete rule sheet descriptions";
  for (const ids of entry.ruleSheetRuleIds) {
    if (ids.some((id) => !id) || new Set(ids).size !== ids.length) return "invalid sheet rule IDs";
  }
  const ids = [...new Set(entry.ruleSheetRuleIds.flat())];
  if (entry.ruleSheetPins.length === 0) {
    if (entry.selections.length !== 0 || ownerSelectionsOf(entry).length !== 0) return "selection without rule sheet";
    return null;
  }
  const selections = entry.visibility === "public" ? entry.selections : ownerSelectionsOf(entry);
  if (selections.length !== entry.qualificationScope.selections.length) return "missing selection metadata";
  const seen = new Set<string>();
  for (const selection of selections) {
    const key = canonicalBytes([selection.phase, selection.readinessPolicy]);
    if (seen.has(key)) return "duplicate selection metadata";
    seen.add(key);
    if (!entry.qualificationScope.selections.some((s) => s.phase === selection.phase && s.readinessPolicy === selection.readinessPolicy)) return "selection outside qualification scope";
    if (canonicalBytes(selection.rules.map((r) => r.ruleId)) !== canonicalBytes(ids)) return "incomplete or duplicate selected rules";
    if (entry.visibility === "public") {
      const publicSelection = selection as AdmissionSelection;
      if (!Array.isArray(publicSelection.settings)) return "missing native settings";
      if (new Set(publicSelection.settings.map((s) => s.rule)).size !== publicSelection.settings.length) return "duplicate effective setting";
      if (publicSelection.settings.some((s) => !ids.includes(s.rule.replace(/^profile:/, "")))) return "unlisted effective setting";
      if (recomputedSelectionDigest(publicSelection) !== selection.severityPolicyDigest) return "selection digest does not recompute";
      for (const row of selection.rules) {
        if (row.severity !== effectiveSeverityOf(row.ruleId, publicSelection.settings, entry)) return "selected severity mismatch";
      }
    } else if (!(selection as OwnerSelectionBinding).ownerReceiptRef) return "owner evidence reference missing";
  }
  return null;
}

function refuse(reason: string): AdmissionVerdict {
  return { admitted: false, code: "missing-receipt", reason };
}

function pinsEqual(a: readonly Pin[], b: readonly Pin[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((p, i) => {
    const q = b[i] as Pin;
    return p.id === q.id && p.version === q.version && p.contentDigest === q.contentDigest;
  });
}

function evidenceEqual(a: DigestEvidence, b: DigestEvidence): boolean {
  if (a.evidenceState !== "resolved" || b.evidenceState !== "resolved") return false;
  return a.digest === b.digest;
}

function pinProblem(pin: Pin, what: string): string | null {
  if (typeof pin !== "object" || pin === null) return `${what} pin not an object`;
  if (Object.keys(pin).sort().join(",") !== "contentDigest,id,version") return `${what} pin fields malformed`;
  if (!isExactVersion(pin.version)) return `${what} floating or unknown version`;
  if (typeof pin.id !== "string" || pin.id === "" || typeof pin.version !== "string" || pin.version === "") {
    return `${what} pin identity malformed`;
  }
  if (!isDigest(pin.contentDigest)) return `${what} pin digest malformed`;
  return null;
}

/** §1.3 Digest discipline: every digest value is a present 64-char lowercase hex string. */
function checkEntryDigests(entry: AdmissionEntry): string | null {
  if (entry.stack.length === 0 || new Set(entry.stack.map((p) => canonicalBytes(p))).size !== entry.stack.length) return "empty or duplicate stack";
  if (!isDigest(entry.pinsDigest)) return "entry pinsDigest malformed";
  const profile = pinProblem(entry.profilePin, "entry profilePin");
  if (profile !== null) return profile;
  if (!isDigest(entry.corpusDigest)) return "entry corpusDigest malformed";
  if (entry.resultEvidence.evidenceState === "resolved" && !isDigest(entry.resultEvidence.digest)) {
    return "entry resultEvidence digest malformed";
  }
  for (const pin of [...entry.stack, ...entry.ruleSheetPins]) {
    const problem = pinProblem(pin, "entry ruleSheetPin");
    if (problem !== null) return problem;
  }
  for (const selection of entry.selections) {
    if (!isDigest(selection.severityPolicyDigest)) return "entry selection severityPolicyDigest malformed";
  }
  for (const selection of ownerSelectionsOf(entry)) {
    if (!isDigest(selection.severityPolicyDigest)) return "entry ownerSelection severityPolicyDigest malformed";
  }
  if (entry.contractSchemaPin !== undefined) {
    const problem = pinProblem(entry.contractSchemaPin, "entry contractSchemaPin");
    if (problem !== null) return problem;
  }
  for (const [label, digests] of [
    ["themeBefore", entry.themeBefore],
    ["themeAfter", entry.themeAfter],
  ] as const) {
    if (digests !== undefined) {
      if (!isDigest(digests.contentDigest) || !isDigest(digests.pinsDigest) || !isDigest(digests.resultDigest)) {
        return `entry ${label} digest malformed`;
      }
    }
  }
  return null;
}

function checkReceiptDigests(receipt: Receipt): string | null {
  if (!isExactVersion(receipt.libraryVersion)) return "receipt floating library version";
  for (const pin of receipt.evaluatedStack.stack) {
    const problem = pinProblem(pin, "receipt stack");
    if (problem !== null) return problem;
  }
  if (!isDigest(receipt.corpusDigest)) return `receipt ${receipt.receiptKind} corpusDigest malformed`;
  if (!isDigest(receipt.evaluatedStack.pinsDigest)) {
    return `receipt ${receipt.receiptKind} evaluatedStack pinsDigest malformed`;
  }
  const evidence = receipt.evaluatedStack.resultEvidence;
  if (evidence.evidenceState === "resolved" && !isDigest(evidence.digest)) {
    return `receipt ${receipt.receiptKind} evaluatedStack result digest malformed`;
  }
  switch (receipt.receiptKind) {
    case "bpmn-parity": {
      const pb = receipt.proofBindings;
      if (!isDigest(pb.corpusAuthority.manifestDigest)) return "bpmn-parity corpusAuthority manifestDigest malformed";
      const profile = pinProblem(pb.profilePin, "bpmn-parity profilePin");
      if (profile !== null) return profile;
      if (!isDigest(pb.severityPolicyDigest)) return "bpmn-parity severityPolicyDigest malformed";
      for (const pin of pb.ruleSheetPins) {
        const problem = pinProblem(pin, "bpmn-parity ruleSheetPin");
        if (problem !== null) return problem;
      }
      if (pb.unicodeLockDigest !== undefined && !isDigest(pb.unicodeLockDigest)) {
        return "bpmn-parity unicodeLockDigest malformed";
      }
      if (pb.compiledLintEvidence.scope === "public") {
        if (!isDigest(pb.compiledLintEvidence.compiledOptions.profileDigest)) {
          return "bpmn-parity compiledOptions profileDigest malformed";
        }
        if (!isDigest(pb.compiledLintEvidence.compiledOptions.severityPolicyDigest)) {
          return "bpmn-parity compiledOptions severityPolicyDigest malformed";
        }
      }
      return null;
    }
    case "bpmn-bijection":
      return pinProblem(receipt.moddleTestPin, "bpmn-bijection moddleTestPin");
    case "family-corpus":
    case "h2a-vocabulary":
    case "mem-descriptor":
      if (!isDigest(receipt.fixtureDigest)) return `receipt ${receipt.receiptKind} fixtureDigest malformed`;
      if (receipt.severityPolicyDigest !== null && !isDigest(receipt.severityPolicyDigest)) {
        return `receipt ${receipt.receiptKind} severityPolicyDigest malformed`;
      }
      return null;
    case "mechanism-compat":
    case "contract-verdict":
    case "theme-invariance": {
      const digests =
        receipt.receiptKind === "theme-invariance"
          ? [
              receipt.semanticDigestsBefore.contentDigest,
              receipt.semanticDigestsBefore.pinsDigest,
              receipt.semanticDigestsBefore.resultDigest,
              receipt.semanticDigestsAfter.contentDigest,
              receipt.semanticDigestsAfter.pinsDigest,
              receipt.semanticDigestsAfter.resultDigest,
            ]
          : [];
      for (const digest of digests) {
        if (!isDigest(digest)) return `receipt ${receipt.receiptKind} semantic digest malformed`;
      }
      return null;
    }
  }
}

function activeVerdicts(receipt: Receipt): readonly RuleVerdict[] {
  switch (receipt.receiptKind) {
    case "bpmn-parity":
    case "family-corpus":
    case "h2a-vocabulary":
    case "mem-descriptor":
      return receipt.ruleVerdicts;
    default:
      return [];
  }
}

type SelectionRows = {
  readonly rules: readonly { readonly ruleId: string; readonly severity: string; readonly studyDisposition?: string }[];
};

/**
 * Effective severity of one selected rule from the native settings (§5.3):
 * the pinned native predicate over the rule's setting row. A rule without
 * its setting row has no bound effective severity and refuses. Where the
 * compiler looks up `profile:<id>`, a bare row id matches that key.
 */
function effectiveSeverityOf(ruleId: string, settings: readonly CompiledSetting[], entry?: AdmissionEntry): string {
  let matches = settings.filter((s) => s.rule === ruleId);
  if (matches.length === 0) matches = settings.filter((s) => s.rule === `profile:${ruleId}`);
  if (matches.length === 0) throw new Error(`no-effective-severity:${ruleId}`);
  const last = matches[matches.length - 1] as CompiledSetting;
  if (entry === undefined || usesBpmn(entry)) return nativeEffectiveSeverity(last.severity);
  const vocabulary = entry.profileShape === "diagram-profile" ? ["error", "warning"]
    : entry.profileShape === "engram-profile" ? ["error", "warning", "info"] : null;
  if (vocabulary === null) throw new Error("unverified descriptor selection vocabulary");
  if (typeof last.severity !== "string" || !vocabulary.includes(last.severity)) throw new Error("invalid family severity");
  return last.severity;
}

/**
 * Every selected rule row requires exactly its own verdict row: severity and
 * study-disposition presence must match the selection, `not-evaluated`
 * refuses, `off` is admitted only where the selection itself is `off`,
 * duplicate verdict rows refuse, and verdicts for unknown rules refuse.
 * Missing rows refuse. checkSelections has already verified the complete
 * selected rows and derived their native severities from effective settings.
 */
function checkVerdictsAgainstSelection(
  receiptKind: string,
  verdicts: readonly RuleVerdict[],
  selection: SelectionRows | null,
): string | null {
  if (selection === null) {
    if (verdicts.length !== 0) return `receipt ${receiptKind} carries rule verdicts with no rule sheet`;
    return null;
  }
  const rows = new Map(selection.rules.map((r) => [r.ruleId, r]));
  const seen = new Set<string>();
  for (const v of verdicts) {
    if (!["off", "pass", "diagnostic", "not-evaluated"].includes(v.verdict) || !["proven", "open"].includes(v.parity)) return "invalid rule verdict";
    if (seen.has(v.ruleId)) return `receipt ${receiptKind} duplicate verdict for rule ${v.ruleId}`;
    seen.add(v.ruleId);
    const row = rows.get(v.ruleId);
    if (row === undefined) return `receipt ${receiptKind} verdict for unknown rule ${v.ruleId}`;
    if (v.verdict === "not-evaluated") {
      return `receipt ${receiptKind} leaves required rule ${v.ruleId} not-evaluated`;
    }
    if (v.severity !== row.severity) {
      return `receipt ${receiptKind} severity mismatch on rule ${v.ruleId}`;
    }
    // `off` comes from the compiled selection only: a verdict claiming `off`
    // for a rule selected with an effective severity is forged.
    if (v.verdict === "off" && row.severity !== "off") {
      return `receipt ${receiptKind} forged off verdict on rule ${v.ruleId}`;
    }
    if (row.severity === "off" && v.verdict !== "off") return "disabled rule has an evaluated verdict";
    if ((row.studyDisposition ?? undefined) !== (v.studyDisposition ?? undefined)) {
      return `receipt ${receiptKind} studyDisposition mismatch on rule ${v.ruleId}`;
    }
  }
  for (const row of selection.rules) {
    if (!verdicts.some((v) => v.ruleId === row.ruleId)) {
      return `receipt ${receiptKind} missing verdict for required rule ${row.ruleId}`;
    }
  }
  return null;
}

/**
 * §5.5 gate as data plus one evaluator. First requires resolved result
 * evidence on both sides with equal digests (a passing receipt with
 * unresolved evidence refuses, FX-RCPT-UNRESOLVED), then compares stack
 * order, pinsDigest and family/selection proof bindings; every mismatch
 * refuses. Requirements sort by canonical key and receipts match as a set:
 * a receipt is consumed only after its full scope matches, so the same
 * inputs in any order give the same verdict.
 */
export function checkAdmission(request: AdmissionRequest): AdmissionVerdict {
  const { entry, receipts } = request;
  try {
    const requiredReceipts = deriveRequirements(entry);
    const selectionsProblem = checkSelections(entry);
    if (selectionsProblem !== null) return refuse(selectionsProblem);
    const requireReference = request.requireReference ?? false;

    const entryDigests = checkEntryDigests(entry);
    if (entryDigests !== null) return refuse(entryDigests);
    if (entry.resultEvidence.evidenceState !== "resolved") {
      return refuse("entry resultEvidence unresolved");
    }
    // §5.3: selections are required for public entries and absent for private ones.
    if (entry.visibility === "private" && entry.selections.length !== 0) {
      return refuse("private entry carries public selections");
    }

    const orderedRequirements = [...requiredReceipts].sort((a, b) =>
      requirementKey(a) < requirementKey(b) ? -1 : requirementKey(a) > requirementKey(b) ? 1 : 0,
    );
    const orderedReceipts = receipts.map((_, index) => index).sort((a, b) => {
      const ka = receiptKey(receipts[a] as Receipt);
      const kb = receiptKey(receipts[b] as Receipt);
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });
    const consumed = new Set<number>();
    for (const requirement of orderedRequirements) {
      let firstProblem: string | null = null;
      let matched: number | null = null;
      for (const index of orderedReceipts) {
        if (consumed.has(index)) continue;
        const receipt = receipts[index] as Receipt;
        if (!receiptMatches(receipt, requirement)) continue;
        if (!receiptScopeMatches(receipt, requirement)) continue;
        const problem = validateReceipt(entry, receipt, requirement, requireReference);
        if (problem === null) {
          matched = index;
          break;
        }
        if (firstProblem === null) firstProblem = problem;
      }
      if (matched === null) {
        const detail = firstProblem === null ? "no candidate" : firstProblem;
        return refuse(
          `required receipt ${requirement.receiptKind} from ${requirement.libraryId}@${requirement.libraryVersion} missing: ${detail}`,
        );
      }
      consumed.add(matched);
    }
    return { admitted: true };
  } catch (error) {
    return refuse(`invalid admission context: ${(error as Error).message}`);
  }
}

/** One receipt satisfies one requirement: kind, library, version, proof set. */
function receiptMatches(receipt: Receipt, requirement: AdmissionRequirement): boolean {
  if (receipt.receiptKind !== requirement.receiptKind) return false;
  if (receipt.libraryId !== requirement.libraryId) return false;
  if (receipt.libraryVersion !== requirement.libraryVersion) return false;
  if (requirement.proofSet !== undefined) {
    if (receipt.receiptKind !== "bpmn-parity") return false;
    if (receipt.proofBindings.proofSet !== requirement.proofSet) return false;
  }
  return true;
}

/**
 * Typed transition-qualification gate (§5.5 common fields): the role/claim
 * union is exhaustive. `retained-check` carries no transition claim;
 * `transitional-oracle` requires the `oracle-witness` arm; only
 * `qualified-ds-execution` with the full `reference-qualified` arm (matrix
 * digest, executor pin, gate reference, proven parity) satisfies the switch.
 * Every required qualification value is validated, never assumed.
 */
function checkRoleWithVerdicts(receipt: Receipt, requireReference: boolean): string | null {
  const kind = receipt.receiptKind;
  const q = receipt.transitionQualification;
  if (receipt.validatorRole === "qualified-ds-execution") {
    if (q === undefined || q.claim !== "reference-qualified") {
      return `receipt ${kind} claims qualified-ds-execution without reference-qualified evidence`;
    }
    if (!isDigest(q.parityMatrixDigest)) {
      return `receipt ${kind} reference-qualified parityMatrixDigest malformed`;
    }
    const executor = pinProblem(q.qualifiedExecutorPin, `receipt ${kind} qualifiedExecutorPin`);
    if (executor !== null) return executor;
    if (typeof q.gateEvidenceRef !== "string" || q.gateEvidenceRef === "") {
      return `receipt ${kind} reference-qualified gateEvidenceRef missing`;
    }
    if (activeVerdicts(receipt).some((r) => r.parity === "open")) {
      return `receipt ${kind} has open parity but claims the reference role`;
    }
    return null;
  }
  if (requireReference) {
    return `receipt ${kind} names ${receipt.validatorRole} where the gate requires the reference`;
  }
  if (receipt.validatorRole === "retained-check") {
    if (q !== undefined) {
      return `receipt ${kind} carries transition qualification on a retained check`;
    }
    return null;
  }
  if (q === undefined || q.claim !== "oracle-witness") {
    return `receipt ${kind} names transitional-oracle without oracle-witness evidence`;
  }
  if (!isDigest(q.parityMatrixDigest)) {
    return `receipt ${kind} oracle-witness parityMatrixDigest malformed`;
  }
  return null;
}

/** Recomputed selection digest over the complete effective settings. */
function recomputedSelectionDigest(selection: { phase: string; readinessPolicy: string; settings: readonly CompiledSetting[] }): Digest {
  return severityPolicyDigestOf(selection.phase, selection.readinessPolicy, selection.settings);
}

function scopeMatches(
  selection: { phase: string; readinessPolicy: string },
  requirement: AdmissionRequirement,
): boolean {
  if (requirement.phase !== undefined && requirement.phase !== selection.phase) return false;
  if (requirement.readinessPolicy !== undefined && requirement.readinessPolicy !== selection.readinessPolicy) {
    return false;
  }
  return true;
}

/**
 * Canonical requirement key: every field that selects a distinct receipt.
 * Requirements sort by this key so the same set in any order matches the
 * same way.
 */
function requirementKey(requirement: AdmissionRequirement): string {
  return [
    requirement.receiptKind,
    requirement.libraryId,
    requirement.libraryVersion,
    requirement.proofSet ?? "",
    requirement.phase ?? "",
    requirement.readinessPolicy ?? "",
  ].join("|");
}

/** Canonical receipt key: the requirement key fields as the receipt carries them. */
function receiptKey(receipt: Receipt): string {
  const base = [receipt.receiptKind, receipt.libraryId, receipt.libraryVersion];
  if (receipt.receiptKind === "bpmn-parity") {
    const evidence = receipt.proofBindings.compiledLintEvidence;
    if (evidence.scope === "public") {
      const options = evidence.compiledOptions as { phase?: unknown; readinessPolicy?: unknown } | undefined;
      const phase = typeof options?.phase === "string" ? options.phase : "unknown";
      const policy = typeof options?.readinessPolicy === "string" ? options.readinessPolicy : "unknown";
      return [...base, receipt.proofBindings.proofSet, phase, policy].join("|");
    }
    return [...base, receipt.proofBindings.proofSet, "private-reference"].join("|");
  }
  return [...base, receipt.severityPolicyDigest ?? "null"].join("|");
}

/**
 * Scope pre-match before consuming a candidate: a scoped requirement never
 * consumes a receipt whose own scope disagrees. For the private reference
 * and digest-bound arms the full scope binds in the arm check below.
 */
function receiptScopeMatches(receipt: Receipt, requirement: AdmissionRequirement): boolean {
  if (requirement.phase === undefined && requirement.readinessPolicy === undefined) return true;
  if (receipt.receiptKind === "bpmn-parity") {
    const evidence = receipt.proofBindings.compiledLintEvidence;
    if (evidence.scope !== "public") return true;
    const options = evidence.compiledOptions as unknown;
    if (typeof options !== "object" || options === null) return false;
    return scopeMatches(options as { phase: string; readinessPolicy: string }, requirement);
  }
  return true;
}

/**
 * Fail-closed per-candidate validation: every check for one requirement and
 * one receipt. A throwing check rejects the candidate, never the gate.
 */
function validateReceipt(
  entry: AdmissionEntry,
  receipt: Receipt,
  requirement: AdmissionRequirement,
  requireReference: boolean,
): string | null {
  try {
    if (receipt.verdict !== "pass") return `required receipt ${receipt.receiptKind} verdict fail`;

    const receiptDigests = checkReceiptDigests(receipt);
    if (receiptDigests !== null) return receiptDigests;

    if (receipt.corpusDigest !== entry.corpusDigest) {
      return `required receipt ${receipt.receiptKind} corpusDigest mismatch`;
    }
    if (receipt.evaluatedStack.resultEvidence.evidenceState !== "resolved") {
      return `required receipt ${receipt.receiptKind} resultEvidence unresolved`;
    }
    if (!evidenceEqual(entry.resultEvidence, receipt.evaluatedStack.resultEvidence)) {
      return `required receipt ${receipt.receiptKind} result digest mismatch`;
    }
    if (!pinsEqual(entry.stack, receipt.evaluatedStack.stack)) {
      return `required receipt ${receipt.receiptKind} evaluated stack mismatch`;
    }
    if (receipt.evaluatedStack.pinsDigest !== entry.pinsDigest) {
      return `required receipt ${receipt.receiptKind} pinsDigest mismatch`;
    }
    const roleProblem = checkRoleWithVerdicts(receipt, requireReference);
    if (roleProblem !== null) return roleProblem;

    return checkArm(entry, receipt, requirement);
  } catch (error) {
    return `required receipt ${receipt.receiptKind} rejected: ${(error as Error).message}`;
  }
}

/**
 * Rule-sheet applicability from the actual sheets: public selections, the
 * owner-side selection binding, or pinned sheet pins. A null policy digest
 * is the explicit no-rule-sheet binding only where none of these apply.
 */
function ruleSheetsApply(entry: AdmissionEntry): boolean {
  return entry.selections.length !== 0 || ownerSelectionsOf(entry).length !== 0 || entry.ruleSheetPins.length !== 0;
}

/**
 * Bind a non-null policy digest to the entry selection it names: the public
 * selection with the same digest in the required scope, or the owner-side
 * selection binding for a private entry.
 */
function selectionForDigest(
  entry: AdmissionEntry,
  digest: Digest,
  requirement: AdmissionRequirement,
): SelectionRows | null {
  if (entry.visibility === "private") {
    const owner = ownerSelectionsOf(entry).find((s) => s.severityPolicyDigest === digest && scopeMatches(s, requirement));
    if (owner === undefined) return null;
    if (owner.severityPolicyDigest !== digest) return null;
    if (!scopeMatches(owner, requirement)) return null;
    return owner;
  }
  const selection = entry.selections.find(
    (s) => s.severityPolicyDigest === digest && scopeMatches(s, requirement),
  );
  if (selection === undefined) return null;
  return selection;
}

/**
 * Admission rule table: one row per receipt kind. Each row lists the receipt
 * kind it needs, every required binding (profile, rule sheets, policy,
 * corpus authority, expected entry pins), the transition-qualification
 * constraint (in `checkRoleWithVerdicts`), the selection the digest must
 * bind, and the public versus owner-side selection path.
 */
function checkArm(entry: AdmissionEntry, receipt: Receipt, requirement: AdmissionRequirement): string | null {
  switch (receipt.receiptKind) {
    case "bpmn-parity": {
      const pb = receipt.proofBindings;
      // Corpus authority at the pinned tag and hash, checked before use (§5.5).
      if (pb.corpusAuthority.tag !== PINNED_CORPUS_AUTHORITY_TAG) {
        return "bpmn-parity corpusAuthority tag mismatch";
      }
      if (pb.corpusAuthority.manifestDigest !== entry.corpusDigest) {
        return "bpmn-parity corpusAuthority manifestDigest mismatch";
      }
      if (!pinsEqual([pb.profilePin], [entry.profilePin])) return "bpmn-parity profilePin mismatch";
      if (!pinsEqual(pb.ruleSheetPins, entry.ruleSheetPins)) return "bpmn-parity ruleSheetPins mismatch";
      const evidence = pb.compiledLintEvidence;
      if (entry.visibility === "private") {
        return checkPrivateParity(entry, receipt, requirement);
      }
      if (evidence.scope !== "public") {
        return "bpmn-parity compiled evidence scope mismatches entry visibility";
      }
      try {
        validatedCompiled(evidence.compiledOptions, evidence.settings);
      } catch (error) {
        return `bpmn-parity compiled evidence invalid: ${(error as Error).message}`;
      }
      // The binding selects exactly one (phase, readinessPolicy) row: digest,
      // recomputed digest, full settings, selector and profile binding agree.
      const selection = entry.selections.find(
        (s) =>
          s.severityPolicyDigest === pb.severityPolicyDigest &&
          scopeMatches(s, requirement) &&
          selectionBinds(s, evidence.compiledOptions, evidence.settings, pb.profilePin, pb.severityPolicyDigest),
      );
      if (selection === undefined) {
        return "bpmn-parity selection, settings or compiled options mismatch the receipt binding";
      }
      // Effective severities derive from the native settings (§5.3).
      return checkVerdictsAgainstSelection(receipt.receiptKind, receipt.ruleVerdicts, selection);
    }
    case "bpmn-bijection": {
      if (typeof receipt.roundTripEvidenceRef !== "string" || receipt.roundTripEvidenceRef.length === 0) return "bpmn-bijection round trip evidence missing";
      if (!Number.isSafeInteger(receipt.descriptorCoverage.covered) || !Number.isSafeInteger(receipt.descriptorCoverage.total) || receipt.descriptorCoverage.total <= 0 || receipt.descriptorCoverage.covered < 0) return "bpmn-bijection coverage malformed";
      if (receipt.descriptorCoverage.covered !== receipt.descriptorCoverage.total) {
        return "bpmn-bijection descriptor coverage incomplete";
      }
      return checkPolicyDigestBinding(entry, receipt, requirement);
    }
    case "family-corpus":
    case "h2a-vocabulary":
    case "mem-descriptor": {
      if (receipt.receiptKind === "family-corpus" && receipt.family !== entry.family) return "family-corpus family mismatch";
      // H2A and MEM run retained family checks only: the retained-check role
      // with no oracle or reference claim (§5.5, FX-RCPT-ARMS). The
      // no-transition-claim half is enforced in `checkRoleWithVerdicts`.
      if (receipt.receiptKind !== "family-corpus" && receipt.validatorRole !== "retained-check") {
        return `receipt ${receipt.receiptKind} must use validatorRole retained-check`;
      }
      if (receipt.fixtureDigest !== entry.corpusDigest) return `${receipt.receiptKind} fixtureDigest mismatch`;
      if (receipt.receiptKind === "h2a-vocabulary") {
        if (!pinsEqual([receipt.protocolPin], [entry.profilePin])) return "h2a-vocabulary protocolPin mismatch";
        if (entry.sourceRevision === undefined) return "h2a-vocabulary entry sourceRevision missing";
        if (receipt.sourceRevision !== entry.sourceRevision) return "h2a-vocabulary sourceRevision mismatch";
      }
      if (receipt.receiptKind === "mem-descriptor" && !pinsEqual([receipt.descriptorPin], [entry.profilePin])) {
        return "mem-descriptor descriptorPin mismatch";
      }
      // Private entries bind through the owner-side selection, never through
      // the public selections array (§5.5 storage by reference).
      if (entry.visibility === "private") {
        return checkPrivateFamilyBinding(entry, receipt, requirement);
      }
      const digest = receipt.severityPolicyDigest ?? null;
      if (digest === null) {
        if (ruleSheetsApply(entry)) return `${receipt.receiptKind} null selection binding with rule sheets`;
        return checkVerdictsAgainstSelection(receipt.receiptKind, activeVerdicts(receipt), null);
      }
      const selection = entry.selections.find(
        (s) =>
          s.severityPolicyDigest === digest &&
          scopeMatches(s, requirement),
      );
      if (selection === undefined) return `${receipt.receiptKind} selection binding stale or unknown`;
      return checkVerdictsAgainstSelection(receipt.receiptKind, activeVerdicts(receipt), selection);
    }
    case "mechanism-compat":
    case "contract-verdict": {
      if (receipt.receiptKind === "contract-verdict") {
        if (entry.contractSchemaPin === undefined) return "contract-verdict entry schema binding missing";
        if (!pinsEqual([receipt.schemaPin], [entry.contractSchemaPin])) return "contract-verdict schemaPin mismatch";
      }
      if (
        typeof receipt.compatibilityMatrixVersion !== "string" ||
        receipt.compatibilityMatrixVersion === "" ||
        entry.compatibilityMatrixVersion === undefined ||
        receipt.compatibilityMatrixVersion !== entry.compatibilityMatrixVersion
      ) {
        return `${receipt.receiptKind} compatibilityMatrixVersion mismatch`;
      }
      return checkPolicyDigestBinding(entry, receipt, requirement);
    }
    case "theme-invariance": {
      if (!pinsEqual([receipt.styledProfilePin], [entry.profilePin])) {
        return "theme-invariance styledProfilePin mismatch";
      }
      if (entry.themeBefore === undefined || entry.themeAfter === undefined) return "theme-invariance expected evidence missing";
      if (canonicalBytes(receipt.semanticDigestsBefore) !== canonicalBytes(entry.themeBefore) || canonicalBytes(receipt.semanticDigestsAfter) !== canonicalBytes(entry.themeAfter)) return "theme-invariance expected evidence mismatch";
      const b = receipt.semanticDigestsBefore;
      const a = receipt.semanticDigestsAfter;
      if (b.contentDigest !== a.contentDigest || b.pinsDigest !== a.pinsDigest || b.resultDigest !== a.resultDigest) {
        return "theme-invariance before/after mismatch";
      }
      return checkPolicyDigestBinding(entry, receipt, requirement);
    }
  }
}

/**
 * Policy-digest binding for arms without rule verdicts (bijection,
 * mechanism, contract, theme): a null digest is the explicit no-rule-sheet
 * binding only where no rule sheet applies; a digest must name the entry
 * selection (public or owner-side) in the required scope.
 */
function checkPolicyDigestBinding(
  entry: AdmissionEntry,
  receipt: Extract<Receipt, { receiptKind: "bpmn-bijection" | "mechanism-compat" | "contract-verdict" | "theme-invariance" }>,
  requirement: AdmissionRequirement,
): string | null {
  const kind = receipt.receiptKind;
  const digest = receipt.severityPolicyDigest ?? null;
  if (digest === null) {
    if (ruleSheetsApply(entry)) return `${kind} null selection binding with rule sheets`;
    return null;
  }
  if (selectionForDigest(entry, digest, requirement) === null) {
    return `${kind} selection binding stale or unknown`;
  }
  return null;
}

/**
 * Owner-side selection binding for private family, vocabulary and
 * descriptor receipts: applicability comes from the actual rule sheets,
 * never from the (empty) public selections array.
 */
function checkPrivateFamilyBinding(
  entry: AdmissionEntry,
  receipt: Extract<Receipt, { receiptKind: "family-corpus" | "h2a-vocabulary" | "mem-descriptor" }>,
  requirement: AdmissionRequirement,
): string | null {
  const kind = receipt.receiptKind;
  const digest = receipt.severityPolicyDigest ?? null;
  if (digest === null) {
    if (ruleSheetsApply(entry)) return `${kind} null selection binding with rule sheets`;
    return checkVerdictsAgainstSelection(kind, activeVerdicts(receipt), null);
  }
  const owner = ownerSelectionsOf(entry).find((s) => s.severityPolicyDigest === digest && scopeMatches(s, requirement));
  if (owner === undefined) return `${kind} private entry without owner selection binding`;
  if (owner.severityPolicyDigest !== digest) return `${kind} owner selection digest mismatch`;
  if (!scopeMatches(owner, requirement)) return `${kind} owner selection outside required scope`;
  return checkVerdictsAgainstSelection(kind, activeVerdicts(receipt), owner);
}

function validatedCompiled(options: CompiledLintOptions, settings: readonly CompiledSetting[]): void {
  assertValidCompiledOptions(options);
  for (const setting of settings) {
    assertValidSetting(setting as unknown as Record<string, unknown>);
  }
}

/**
 * checkSelections recomputes the selection digest over the complete settings;
 * the full native selection then binds the receipt: the compiled evidence carries those
 * identical settings with the identical selector, the native profile digest
 * equals the entry profile pin, and the policy digest is the same value in
 * every copy (public payload, receipt binding, compiled evidence).
 */
function selectionBinds(
  selection: AdmissionSelection,
  compiledOptions: CompiledLintOptions,
  settings: readonly CompiledSetting[],
  profilePin: Pin,
  bindingDigest: Digest,
): boolean {
  if (selection.severityPolicyDigest !== bindingDigest) return false;
  if (compiledOptions.severityPolicyDigest !== bindingDigest) return false;
  if (compiledOptions.phase !== selection.phase || compiledOptions.readinessPolicy !== selection.readinessPolicy) {
    return false;
  }
  if (compiledOptions.profileDigest !== profilePin.contentDigest) return false;
  if (canonicalBytes(settings) !== canonicalBytes(selection.settings)) return false;
  if (selection.expectedCompiledOptions === undefined) return false;
  assertValidCompiledOptions(selection.expectedCompiledOptions);
  // Recompute the complete canonical native evidence; stored digest equality
  // cannot authenticate rule bodies, per-rule bindings or the top-level snapshot.
  if (canonicalBytes(compiledOptions) !== canonicalBytes(selection.expectedCompiledOptions)) return false;
  return true;
}

/**
 * Private entries admit only through the owner-side path (§5.5): no public
 * selections, a `private-reference` evidence scope with its opaque owner
 * reference, and verdicts checked against the owner selection binding.
 */
function checkPrivateParity(
  entry: AdmissionEntry,
  receipt: Extract<Receipt, { receiptKind: "bpmn-parity" }>,
  requirement: AdmissionRequirement,
): string | null {
  const evidence = receipt.proofBindings.compiledLintEvidence;
  if (evidence.scope !== "private-reference") {
    return "bpmn-parity compiled evidence scope mismatches entry visibility";
  }
  if (typeof evidence.ownerReceiptRef !== "string" || evidence.ownerReceiptRef === "") {
    return "bpmn-parity private-reference without owner receipt reference";
  }
  const owner = ownerSelectionsOf(entry).find((s) => scopeMatches(s, requirement));
  if (owner === undefined) return "bpmn-parity private entry without owner selection binding";
  if (evidence.ownerReceiptRef !== owner.ownerReceiptRef) return "bpmn-parity owner evidence reference mismatch";
  if (receipt.proofBindings.severityPolicyDigest !== owner.severityPolicyDigest) {
    return "bpmn-parity owner selection digest mismatch";
  }
  if (!scopeMatches(owner, requirement)) return "bpmn-parity owner selection outside required scope";
  // The full owner evidence stays owner-side; the guardian checks the
  // opaque binding (digest, scope, verdict rows), never the settings.
  return checkVerdictsAgainstSelection(receipt.receiptKind, receipt.ruleVerdicts, owner);
}
