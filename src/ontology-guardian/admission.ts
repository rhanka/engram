// §5.5 admission gate as a pure function. Refuses unresolved or mismatching
// result evidence explicitly; never falls back to latest.
import type { Digest, DigestEvidence, Pin } from "./types.js";
import type { Receipt, RuleVerdict } from "./catalog.js";

export interface AdmissionSelection {
  readonly phase: string;
  readonly readinessPolicy: string;
  readonly settings: readonly Record<string, unknown>[];
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
  readonly compatibilityMatrixVersion?: string;
  readonly themeBefore?: { readonly contentDigest: Digest; readonly pinsDigest: Digest; readonly resultDigest: Digest };
  readonly themeAfter?: { readonly contentDigest: Digest; readonly pinsDigest: Digest; readonly resultDigest: Digest };
}

export interface AdmissionRequest {
  readonly entry: AdmissionEntry;
  /** Required receipt arms for the entry scope (§5.4); every one must pass. */
  readonly requiredReceiptKinds: readonly Receipt["receiptKind"][];
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

function checkVerdictsAgainstSelections(
  receiptKind: string,
  verdicts: readonly RuleVerdict[],
  selections: readonly AdmissionSelection[],
): string | null {
  if (selections.length === 0) {
    if (verdicts.length !== 0) return `receipt ${receiptKind} carries rule verdicts with no rule sheet`;
    return null;
  }
  for (const v of verdicts) {
    if (v.verdict === "not-evaluated") {
      return `receipt ${receiptKind} leaves required rule ${v.ruleId} not-evaluated`;
    }
    if (v.verdict === "off") continue;
    const match = [...selections].some((s) =>
      s.rules.some(
        (r) =>
          r.ruleId === v.ruleId &&
          r.severity === v.severity &&
          (r.studyDisposition ?? undefined) === (v.studyDisposition ?? undefined),
      ),
    );
    if (!match) return `receipt ${receiptKind} severity/studyDisposition mismatch on rule ${v.ruleId}`;
  }
  return null;
}

/**
 * §5.5 gate. First requires resolved result evidence on both sides with equal
 * digests (a passing receipt with unresolved evidence refuses, FX-RCPT-UNRESOLVED),
 * then compares stack order, pinsDigest and family/selection proof bindings.
 */
export function checkAdmission(request: AdmissionRequest): AdmissionVerdict {
  const { entry, receipts, requiredReceiptKinds } = request;
  const requireReference = request.requireReference ?? false;

  if (entry.resultEvidence.evidenceState !== "resolved") {
    return refuse("entry resultEvidence unresolved");
  }
  for (const kind of requiredReceiptKinds) {
    const receipt = receipts.find((r) => r.receiptKind === kind);
    if (receipt === undefined) return refuse(`required receipt ${kind} missing`);
    if (receipt.verdict !== "pass") return refuse(`required receipt ${kind} verdict fail`);
    if (receipt.evaluatedStack.resultEvidence.evidenceState !== "resolved") {
      return refuse(`required receipt ${kind} resultEvidence unresolved`);
    }
    if (!evidenceEqual(entry.resultEvidence, receipt.evaluatedStack.resultEvidence)) {
      return refuse(`required receipt ${kind} result digest mismatch`);
    }
    if (!pinsEqual(entry.stack, receipt.evaluatedStack.stack)) {
      return refuse(`required receipt ${kind} evaluated stack mismatch`);
    }
    if (receipt.evaluatedStack.pinsDigest !== entry.pinsDigest) {
      return refuse(`required receipt ${kind} pinsDigest mismatch`);
    }
    const roleProblem = checkRoleWithVerdicts(receipt, requireReference);
    if (roleProblem !== null) return refuse(roleProblem);

    const armProblem = checkArm(entry, receipt);
    if (armProblem !== null) return refuse(armProblem);
  }
  return { admitted: true };
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

function checkArm(entry: AdmissionEntry, receipt: Receipt): string | null {
  switch (receipt.receiptKind) {
    case "bpmn-parity": {
      const pb = receipt.proofBindings;
      if (!pinsEqual([pb.profilePin], [entry.profilePin])) return "bpmn-parity profilePin mismatch";
      if (!pinsEqual(pb.ruleSheetPins, entry.ruleSheetPins)) return "bpmn-parity ruleSheetPins mismatch";
      const selection = entry.selections.find(
        (s) => s.severityPolicyDigest === pb.severityPolicyDigest,
      );
      if (selection === undefined) return "bpmn-parity severityPolicyDigest matches no selection";
      const scope = pb.compiledLintEvidence.scope;
      if ((entry.visibility === "public") !== (scope === "public")) {
        return "bpmn-parity compiled evidence scope mismatches entry visibility";
      }
      return checkVerdictsAgainstSelections(receipt.receiptKind, receipt.ruleVerdicts, entry.selections);
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
      if (receipt.fixtureDigest !== entry.corpusDigest) return `${receipt.receiptKind} fixtureDigest mismatch`;
      if (receipt.receiptKind === "h2a-vocabulary" && !pinsEqual([receipt.protocolPin], [entry.profilePin])) {
        return "h2a-vocabulary protocolPin mismatch";
      }
      if (receipt.receiptKind === "mem-descriptor" && !pinsEqual([receipt.descriptorPin], [entry.profilePin])) {
        return "mem-descriptor descriptorPin mismatch";
      }
      if (receipt.severityPolicyDigest === null) {
        if (entry.selections.length !== 0) return `${receipt.receiptKind} null selection with rule sheets`;
        if (activeVerdicts(receipt).length !== 0) return `${receipt.receiptKind} verdicts with no rule sheet`;
        return null;
      }
      const selection = entry.selections.find((s) => s.severityPolicyDigest === receipt.severityPolicyDigest);
      if (selection === undefined) return `${receipt.receiptKind} severityPolicyDigest matches no selection`;
      return checkVerdictsAgainstSelections(receipt.receiptKind, activeVerdicts(receipt), entry.selections);
    }
    case "mechanism-compat":
    case "contract-verdict": {
      if (
        entry.compatibilityMatrixVersion !== undefined &&
        receipt.compatibilityMatrixVersion !== entry.compatibilityMatrixVersion
      ) {
        return `${receipt.receiptKind} compatibilityMatrixVersion mismatch`;
      }
      return null;
    }
    case "theme-invariance": {
      const b = receipt.semanticDigestsBefore;
      const a = receipt.semanticDigestsAfter;
      if (b.contentDigest !== a.contentDigest || b.pinsDigest !== a.pinsDigest || b.resultDigest !== a.resultDigest) {
        return "theme-invariance before/after mismatch";
      }
      return null;
    }
  }
}
