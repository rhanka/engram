// §5 catalog payload of kind ontology (G0 transcription, data only).
import type {
  ArtifactKind,
  Completeness,
  Digest,
  DigestEvidence,
  Lifecycle,
  Pin,
  PinList,
  ProfileShape,
  TenantVisibility,
} from "./types.js";

// --- §5.2 pinned v9 envelope (verbatim scope; G0 adds kind value + payload) ---

export type RegistryKind = "skill" | "mcp" | "ontology";

export interface RegistryCompatibility {
  readonly entryContract: string;
  readonly packages: readonly { readonly name: string; readonly range: string }[];
  readonly schemaProfiles: readonly string[];
  readonly requiredHostFeatures: readonly string[];
  readonly optionalHostFeatures: readonly string[];
}

export interface RegistryParameters {
  readonly schemaVersion: string;
  readonly schema: Record<string, unknown>;
  readonly defaults: Record<string, unknown>;
}

export interface RegistryBinding {
  readonly key: string;
  readonly contract: string;
  readonly required: boolean;
}

export interface RegistryAsset {
  readonly role: string;
  readonly path: string;
  readonly mediaType: string;
  readonly sha256: Digest;
}

export interface RegistryEnvelope {
  readonly format: "sentropic.registry-entry/v1";
  readonly contractVersion: string;
  readonly kind: RegistryKind;
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly entryVersion: string;
  readonly publisher: { readonly packageName: string; readonly packageVersion: string };
  readonly compatibility: RegistryCompatibility;
  readonly parameters: RegistryParameters;
  readonly bindings: readonly RegistryBinding[];
  readonly assets: readonly RegistryAsset[];
  readonly ontology?: OntologyPayload;
  readonly extensions?: Record<string, unknown>;
  readonly requiredExtensions?: readonly string[];
}

// --- §5.3 ontology payload (closed) ---

export interface SelectionRuleRow {
  readonly ruleId: string;
  /** Effective selected severity in the pinned native vocabulary. */
  readonly severity: string;
  readonly studyDisposition?: string;
}

export interface SelectionMetadata {
  readonly phase: string;
  readonly readinessPolicy: string;
  /** Whole composed selection, native effective-setting order. */
  readonly settings: readonly Record<string, unknown>[];
  readonly severityPolicyDigest: Digest;
  readonly rules: readonly SelectionRuleRow[];
}

export interface RuleSheetRef {
  readonly sheetPin: Pin;
  readonly ruleIds: readonly string[];
  /** Required for public entries; absent for private entries. */
  readonly selections?: readonly SelectionMetadata[];
}

export interface LicenceClosure {
  readonly licences: readonly string[];
  readonly closureDigest: Digest;
}

export interface CoverageRecord {
  readonly declaredLimits: string;
  readonly coverageDigest: Digest;
}

export interface ProvenanceRecord {
  readonly sourceRef: string;
  readonly sourceRevision: string;
}

export type ArtifactBinding =
  | {
      readonly artifactKind: "mechanism";
      readonly mechanismVersion: string;
      readonly descriptorPins: PinList;
      readonly compatibilityMatrixVersion: string;
    }
  | {
      readonly artifactKind: "base";
      readonly basePin: Pin;
      readonly bijectionEvidence:
        | { readonly evidenceState: "resolved"; readonly receiptRef: string }
        | { readonly evidenceState: "unresolved" };
    }
  | {
      readonly artifactKind: "profile";
      readonly profilePin: Pin;
      readonly stack: PinList;
      readonly relationMatrixRef?: string;
    }
  | {
      readonly artifactKind: "theme";
      readonly themeDigest: Digest;
      readonly appliesTo: Pin;
    }
  | {
      readonly artifactKind: "corpus";
      readonly manifestDigest: Digest;
      readonly manifestRef: string;
      readonly sealedVectorsDigest: Digest;
      readonly caseCounts: { readonly publishedCases: number; readonly localVectors: number };
    }
  | {
      readonly artifactKind: "contract";
      readonly schemaPin: Pin;
      readonly compatibilityMatrixVersion: string;
    };

export type PayloadLineage =
  | {
      readonly scope: "public";
      readonly parents: PinList;
      readonly derivation?: {
        readonly base: Pin;
        readonly operations: readonly unknown[];
        readonly resultingDigests: {
          readonly contentDigest: Digest;
          readonly pinsDigest: Digest;
          readonly resultEvidence: DigestEvidence;
        };
      };
      readonly mappings: readonly string[];
      readonly migrations: readonly string[];
    }
  | { readonly scope: "private"; readonly lineage: import("./types.js").PrivateLineage };

export interface OntologyPayload {
  readonly canonicalRef: string;
  readonly namespace: string;
  readonly owner: string;
  readonly domain?: string;
  readonly profileShape: ProfileShape;
  readonly artifactKind: ArtifactKind;
  readonly profilePin: Pin;
  readonly stack: PinList;
  readonly digests: {
    readonly contentDigest: Digest;
    readonly pinsDigest: Digest;
    readonly resultEvidence: DigestEvidence;
  };
  readonly ruleSheets: readonly RuleSheetRef[];
  readonly lifecycle: Lifecycle;
  readonly deprecatedReason?: string;
  readonly deprecatedAt?: string;
  readonly supersededBy?: Pin;
  readonly provenance: ProvenanceRecord;
  readonly licenceClosure?: LicenceClosure;
  readonly coverage?: CoverageRecord;
  readonly lineage: PayloadLineage;
  readonly conflictPolicy: string;
  readonly completeness: Completeness;
  readonly corpusRef: { readonly ref: string; readonly digest: Digest };
  readonly receipts: readonly Receipt[];
  readonly migrations: readonly string[];
  readonly consumers: readonly string[];
  readonly compatibility: { readonly renderer: string; readonly adapter: string };
  readonly visibility: TenantVisibility;
  readonly linkedTools: readonly string[];
  readonly artifactBinding: ArtifactBinding;
}

// --- §5.5 receipts (closed, discriminated on receiptKind) ---

export type ValidatorRole = "transitional-oracle" | "retained-check" | "qualified-ds-execution";

export interface EvaluatedStack {
  readonly stack: PinList;
  readonly pinsDigest: Digest;
  readonly resultEvidence: DigestEvidence;
}

export type TransitionQualification =
  | { readonly claim: "oracle-witness"; readonly parityMatrixDigest: Digest }
  | {
      readonly claim: "reference-qualified";
      readonly parityMatrixDigest: Digest;
      readonly qualifiedExecutorPin: Pin;
      readonly gateEvidenceRef: string;
    };

export interface RuleVerdict {
  readonly ruleId: string;
  readonly severity: string;
  readonly verdict: "off" | "pass" | "diagnostic" | "not-evaluated";
  readonly parity: "proven" | "open";
  readonly studyDisposition?: string;
}

export interface ReceiptBase {
  readonly receiptKind:
    | "bpmn-parity"
    | "bpmn-bijection"
    | "family-corpus"
    | "h2a-vocabulary"
    | "mem-descriptor"
    | "mechanism-compat"
    | "contract-verdict"
    | "theme-invariance";
  readonly corpusDigest: Digest;
  readonly libraryId: string;
  readonly libraryVersion: string;
  readonly validatorRole: ValidatorRole;
  readonly verdict: "pass" | "fail";
  readonly issuedAt: string;
  readonly evaluatedStack: EvaluatedStack;
  readonly transitionQualification?: TransitionQualification;
}

export interface CompiledLintOptions {
  readonly mechanismVersion: string;
  readonly profileDigest: string;
  readonly phase: string;
  readonly readinessPolicy: string;
  readonly compiledRules: readonly Record<string, unknown>[];
  readonly bindings: readonly { readonly ownerId: string; readonly role: string; readonly targetId: string }[];
  readonly severityPolicyDigest: Digest;
}

export type CompiledLintEvidence =
  | {
      readonly scope: "public";
      readonly compiledOptions: CompiledLintOptions;
      readonly settings: readonly Record<string, unknown>[];
    }
  | { readonly scope: "private-reference"; readonly ownerReceiptRef: string };

export type Receipt =
  | (ReceiptBase & {
      readonly receiptKind: "bpmn-parity";
      readonly proofBindings: {
        readonly proofSet: "published-corpus" | "local-expectations";
        readonly corpusAuthority: { readonly tag: string; readonly manifestDigest: Digest };
        readonly unicodeLockDigest?: Digest;
        readonly profilePin: Pin;
        readonly severityPolicyDigest: Digest;
        readonly ruleSheetPins: PinList;
        readonly compiledLintEvidence: CompiledLintEvidence;
      };
      readonly ruleVerdicts: readonly RuleVerdict[];
    })
  | (ReceiptBase & {
      readonly receiptKind: "bpmn-bijection";
      readonly descriptorCoverage: { readonly covered: number; readonly total: number };
      readonly roundTripEvidenceRef: string;
      readonly moddleTestPin: Pin;
      readonly severityPolicyDigest: Digest | null;
    })
  | (ReceiptBase & {
      readonly receiptKind: "family-corpus";
      readonly family: "DIA" | "ENG" | "TRK" | "HRN" | "RPK" | "EXT";
      readonly fixtureDigest: Digest;
      readonly severityPolicyDigest: Digest | null;
      readonly ruleVerdicts: readonly RuleVerdict[];
    })
  | (ReceiptBase & {
      readonly receiptKind: "h2a-vocabulary";
      readonly protocolPin: Pin;
      readonly sourceRevision: string;
      readonly fixtureDigest: Digest;
      readonly severityPolicyDigest: Digest | null;
      readonly ruleVerdicts: readonly RuleVerdict[];
    })
  | (ReceiptBase & {
      readonly receiptKind: "mem-descriptor";
      readonly descriptorPin: Pin;
      readonly fixtureDigest: Digest;
      readonly severityPolicyDigest: Digest | null;
      readonly ruleVerdicts: readonly RuleVerdict[];
    })
  | (ReceiptBase & {
      readonly receiptKind: "mechanism-compat";
      readonly compatibilityMatrixVersion: string;
      readonly caseVerdicts: readonly { readonly caseId: string; readonly errorCode?: string }[];
      readonly severityPolicyDigest: Digest | null;
    })
  | (ReceiptBase & {
      readonly receiptKind: "contract-verdict";
      readonly schemaPin: Pin;
      readonly compatibilityMatrixVersion: string;
      readonly caseVerdicts: readonly { readonly caseId: string; readonly errorCode?: string }[];
      readonly severityPolicyDigest: Digest | null;
    })
  | (ReceiptBase & {
      readonly receiptKind: "theme-invariance";
      readonly styledProfilePin: Pin;
      readonly semanticDigestsBefore: {
        readonly contentDigest: Digest;
        readonly pinsDigest: Digest;
        readonly resultDigest: Digest;
      };
      readonly semanticDigestsAfter: {
        readonly contentDigest: Digest;
        readonly pinsDigest: Digest;
        readonly resultDigest: Digest;
      };
      readonly severityPolicyDigest: Digest | null;
    });
