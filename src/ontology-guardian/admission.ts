// §5.5 admission gate as a pure function. Refuses unresolved or mismatching
// result evidence explicitly; never falls back to latest.
import { canonicalBytes } from "./canonical.js";
import { severityPolicyDigestOf } from "./digests.js";
import { assertValidCompiledOptions, assertValidSetting } from "./diagnostics.js";
import { isDigest } from "./types.js";
import type { CompiledSetting } from "./diagnostics.js";
import type { Digest, DigestEvidence, Pin } from "./types.js";
import type { CompiledLintOptions, Receipt, RuleVerdict } from "./catalog.js";

export interface AdmissionSelection {
  readonly phase: string;
  readonly readinessPolicy: string;
  /** Whole composed selection, native effective-setting order. */
  readonly settings: readonly CompiledSetting[];
  readonly severityPolicyDigest: Digest;
  readonly rules: readonly { readonly ruleId: string; readonly severity: string; readonly studyDisposition?: string }[];
}

/**
 * Owner-side selection binding for private entries. Carries the selected
 * (phase, readinessPolicy), its policy digest and the effective rule rows —
 * never the settings themselves, which stay owner-side (§5.5).
 */
export interface OwnerSelectionBinding {
  readonly phase: string;
  readonly readinessPolicy: string;
  readonly severityPolicyDigest: Digest;
  readonly rules: readonly { readonly ruleId: string; readonly severity: string; readonly studyDisposition?: string }[];
}

export interface AdmissionEntry {
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
  readonly requiredReceipts: readonly AdmissionRequirement[];
  readonly receipts: readonly Receipt[];
  /** True once the transition gate requires the qualified reference role. */
  readonly requireReference?: boolean;
}

export type AdmissionVerdict =
  | { readonly admitted: true }
  | { readonly admitted: false; readonly code: "missing-receipt"; readonly reason: string };

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
  if (typeof pin.id !== "string" || pin.id === "" || typeof pin.version !== "string" || pin.version === "") {
    return `${what} pin identity malformed`;
  }
  if (!isDigest(pin.contentDigest)) return `${what} pin digest malformed`;
  return null;
}

/** §1.3 Digest discipline: every digest value is a present 64-char lowercase hex string. */
function checkEntryDigests(entry: AdmissionEntry): string | null {
  if (!isDigest(entry.pinsDigest)) return "entry pinsDigest malformed";
  const profile = pinProblem(entry.profilePin, "entry profilePin");
  if (profile !== null) return profile;
  if (!isDigest(entry.corpusDigest)) return "entry corpusDigest malformed";
  if (entry.resultEvidence.evidenceState === "resolved" && !isDigest(entry.resultEvidence.digest)) {
    return "entry resultEvidence digest malformed";
  }
  for (const pin of entry.ruleSheetPins) {
    const problem = pinProblem(pin, "entry ruleSheetPin");
    if (problem !== null) return problem;
  }
  for (const selection of entry.selections) {
    if (!isDigest(selection.severityPolicyDigest)) return "entry selection severityPolicyDigest malformed";
  }
  if (entry.ownerSelection !== undefined && !isDigest(entry.ownerSelection.severityPolicyDigest)) {
    return "entry ownerSelection severityPolicyDigest malformed";
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
 * Every selected rule row requires exactly its own verdict row: severity and
 * study-disposition presence must match the selection, `not-evaluated`
 * refuses, `off` is admitted only where the selection itself is `off`,
 * and verdicts for unknown rules refuse. Missing rows refuse.
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
  for (const v of verdicts) {
    const row = rows.get(v.ruleId);
    if (row === undefined) return `receipt ${receiptKind} verdict for unknown rule ${v.ruleId}`;
    if (v.verdict === "not-evaluated") {
      return `receipt ${receiptKind} leaves required rule ${v.ruleId} not-evaluated`;
    }
    if (v.severity !== row.severity) {
      return `receipt ${receiptKind} severity mismatch on rule ${v.ruleId}`;
    }
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
 * §5.5 gate. First requires resolved result evidence on both sides with equal
 * digests (a passing receipt with unresolved evidence refuses, FX-RCPT-UNRESOLVED),
 * then compares stack order, pinsDigest and family/selection proof bindings;
 * every mismatch refuses. Each requirement binds exactly one receipt by
 * implementing library, version, proof set and qualification scope.
 */
export function checkAdmission(request: AdmissionRequest): AdmissionVerdict {
  const { entry, receipts, requiredReceipts } = request;
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

  const consumed = new Set<number>();
  for (const requirement of requiredReceipts) {
    const index = receipts.findIndex((receipt, i) => !consumed.has(i) && receiptMatches(receipt, requirement));
    if (index === -1) {
      return refuse(
        `required receipt ${requirement.receiptKind} from ${requirement.libraryId}@${requirement.libraryVersion} missing`,
      );
    }
    consumed.add(index);
    const receipt = receipts[index] as Receipt;
    if (receipt.verdict !== "pass") return refuse(`required receipt ${receipt.receiptKind} verdict fail`);

    const receiptDigests = checkReceiptDigests(receipt);
    if (receiptDigests !== null) return refuse(receiptDigests);

    if (receipt.corpusDigest !== entry.corpusDigest) {
      return refuse(`required receipt ${receipt.receiptKind} corpusDigest mismatch`);
    }
    if (receipt.evaluatedStack.resultEvidence.evidenceState !== "resolved") {
      return refuse(`required receipt ${receipt.receiptKind} resultEvidence unresolved`);
    }
    if (!evidenceEqual(entry.resultEvidence, receipt.evaluatedStack.resultEvidence)) {
      return refuse(`required receipt ${receipt.receiptKind} result digest mismatch`);
    }
    if (!pinsEqual(entry.stack, receipt.evaluatedStack.stack)) {
      return refuse(`required receipt ${receipt.receiptKind} evaluated stack mismatch`);
    }
    if (receipt.evaluatedStack.pinsDigest !== entry.pinsDigest) {
      return refuse(`required receipt ${receipt.receiptKind} pinsDigest mismatch`);
    }
    const roleProblem = checkRoleWithVerdicts(receipt, requireReference);
    if (roleProblem !== null) return refuse(roleProblem);

    const armProblem = checkArm(entry, receipt, requirement);
    if (armProblem !== null) return refuse(armProblem);
  }
  return { admitted: true };
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

function checkRoleWithVerdicts(receipt: Receipt, requireReference: boolean): string | null {
  if (receipt.validatorRole === "qualified-ds-execution") {
    const q = receipt.transitionQualification;
    if (q === undefined || q.claim !== "reference-qualified") {
      return `receipt ${receipt.receiptKind} claims qualified-ds-execution without reference-qualified evidence`;
    }
    if (activeVerdicts(receipt).some((r) => r.parity === "open")) {
      return `receipt ${receipt.receiptKind} has open parity but claims the reference role`;
    }
    return null;
  }
  if (requireReference) {
    return `receipt ${receipt.receiptKind} names ${receipt.validatorRole} where the gate requires the reference`;
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

function checkArm(entry: AdmissionEntry, receipt: Receipt, requirement: AdmissionRequirement): string | null {
  switch (receipt.receiptKind) {
    case "bpmn-parity": {
      const pb = receipt.proofBindings;
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
      return checkVerdictsAgainstSelection(receipt.receiptKind, receipt.ruleVerdicts, selection);
    }
    case "bpmn-bijection": {
      if (receipt.descriptorCoverage.covered !== receipt.descriptorCoverage.total) {
        return "bpmn-bijection descriptor coverage incomplete";
      }
      return null;
    }
    case "family-corpus":
    case "h2a-vocabulary":
    case "mem-descriptor": {
      // H2A and MEM run retained family checks only: no oracle role, no
      // transition claim, no BPMN proof fields (§5.5, FX-RCPT-ARMS).
      if (receipt.receiptKind !== "family-corpus") {
        if (receipt.validatorRole !== "retained-check") {
          return `receipt ${receipt.receiptKind} must use validatorRole retained-check`;
        }
        if (receipt.transitionQualification !== undefined) {
          return `receipt ${receipt.receiptKind} carries transition qualification on a retained check`;
        }
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
      if (receipt.severityPolicyDigest === null) {
        if (entry.selections.length !== 0) return `${receipt.receiptKind} null selection with rule sheets`;
        return checkVerdictsAgainstSelection(receipt.receiptKind, activeVerdicts(receipt), null);
      }
      const selection = entry.selections.find(
        (s) =>
          s.severityPolicyDigest === receipt.severityPolicyDigest &&
          scopeMatches(s, requirement) &&
          recomputedSelectionDigest(s) === receipt.severityPolicyDigest,
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
      return null;
    }
    case "theme-invariance": {
      if (!pinsEqual([receipt.styledProfilePin], [entry.profilePin])) {
        return "theme-invariance styledProfilePin mismatch";
      }
      const b = receipt.semanticDigestsBefore;
      const a = receipt.semanticDigestsAfter;
      if (b.contentDigest !== a.contentDigest || b.pinsDigest !== a.pinsDigest || b.resultDigest !== a.resultDigest) {
        return "theme-invariance before/after mismatch";
      }
      return null;
    }
  }
}

function validatedCompiled(options: CompiledLintOptions, settings: readonly CompiledSetting[]): void {
  assertValidCompiledOptions(options);
  for (const setting of settings) {
    assertValidSetting(setting as unknown as Record<string, unknown>);
  }
}

/**
 * The full native selection binds the receipt: the stored selection digest
 * recomputes over the complete settings, the compiled evidence carries those
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
  if (recomputedSelectionDigest(selection) !== selection.severityPolicyDigest) return false;
  if (selection.severityPolicyDigest !== bindingDigest) return false;
  if (compiledOptions.severityPolicyDigest !== bindingDigest) return false;
  if (compiledOptions.phase !== selection.phase || compiledOptions.readinessPolicy !== selection.readinessPolicy) {
    return false;
  }
  if (compiledOptions.profileDigest !== profilePin.contentDigest) return false;
  if (canonicalBytes(settings) !== canonicalBytes(selection.settings)) return false;
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
  const owner = entry.ownerSelection;
  if (owner === undefined) return "bpmn-parity private entry without owner selection binding";
  if (receipt.proofBindings.severityPolicyDigest !== owner.severityPolicyDigest) {
    return "bpmn-parity owner selection digest mismatch";
  }
  if (!scopeMatches(owner, requirement)) return "bpmn-parity owner selection outside required scope";
  return checkVerdictsAgainstSelection(receipt.receiptKind, receipt.ruleVerdicts, owner);
}
