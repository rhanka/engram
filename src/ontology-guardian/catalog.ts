// §5 catalog payload of kind ontology (G0 transcription, data only).
import type {
  ArtifactKind,
  Completeness,
  Digest,
  DigestEvidence,
  Lifecycle,
  Pin,
  PinList,
  PrivateLineage,
  ProfileShape,
  PublicLineage,
} from "./types.js";
import type { CompiledLintOptionsNative, CompiledSetting } from "./diagnostics.js";

// --- §5.2 pinned v9 envelope (verbatim scope; G0 adds kind value + payload) ---

export type RegistryKind = "skill" | "mcp" | "ontology";

/**
 * S-V9 normative types, transcribed verbatim ([R9:§3.2]).
 * G0 adds only the `ontology` kind value and its payload arm; no v9 field
 * is paraphrased, merged or dropped.
 */
export interface DocumentSchema {
  readonly name: string;
  readonly schemaId: string;
  readonly version: string;
  readonly assetPath: string;
  readonly sha256: string;
}

export interface EntryDependency {
  readonly kind: "skill" | "mcp";
  readonly id: string;
  readonly entryRange: string;
  readonly required: boolean;
  readonly requiredFeatures: string[];
}

export interface TransportProfile {
  readonly id: string;
  readonly mode: "in-process" | "stdio" | "streamable-http" | "binding";
  readonly bindingKey?: string;
  readonly protocolVersions: string[];
  readonly requiredHostFeatures: string[];
}

export interface UiProfile {
  readonly mcpAppsRevision: string;
  readonly a2uiSchemaRevision: string;
  readonly resourceMimeTypes: string[];
  readonly requiredHostFeatures: string[];
  readonly documentSchemas: DocumentSchema[];
  readonly catalog: { readonly id: string; readonly version: "0.9.1"; readonly asset: string; readonly sha256: string };
}

export interface McpPayload {
  readonly manifestAsset: string;
  readonly connectorIds: string[];
  readonly transportProfiles: TransportProfile[];
  readonly protocolVersions: string[];
  readonly authorizationProfileSchemaAsset?: string;
  readonly capabilityProfiles?: {
    readonly id: string;
    readonly tools: string[];
    readonly resources: string[];
    readonly prompts: string[];
    readonly readOnly: boolean;
  }[];
  readonly ui?: UiProfile;
}

/**
 * Skill profile selector ([R9:§4.1] lines 233–235: `profile`: `instructions`
 * or `tools`). A single literal discriminant, never an invented object arm:
 * a spec-compliant selector is exactly one of the two words.
 */
export type SkillProfileSelector = "instructions" | "tools";

/** Skill metadata ([R9:§4.1]); name/version/description agree with the envelope. */
export interface SkillMetadata {
  readonly category: string;
  readonly contextFilters: readonly unknown[];
  readonly permissionRequirements: readonly unknown[];
  readonly toolNames: readonly string[];
}

export interface SkillCapability {
  readonly id: string;
  readonly description: string;
  readonly effect: "read-only" | "mutation";
  readonly permissions: readonly unknown[];
  readonly inputSchemaRef?: string;
  readonly outputSchemaRef?: string;
}

/**
 * Skill tool-bearing profile descriptors ([R9:§4.1]: `tools` is the existing
 * `SkillTool` descriptors). Exact tool fields stay with the skills package
 * and are not transcribed here: this descriptor is `unverified`, kept closed
 * as an opaque record, never widened into invented tool fields.
 */
export type SkillToolDescriptor = Record<string, unknown>;

/** `skill` arm ([R9:§4.1]); `instructions` requires `tools: []` and `metadata.toolNames: []`. */
export interface SkillPayload {
  readonly profile: SkillProfileSelector;
  readonly metadata: SkillMetadata;
  readonly instructionsAsset: string;
  readonly capabilities: readonly SkillCapability[];
  readonly tools: readonly SkillToolDescriptor[];
  readonly documentSchemas: DocumentSchema[];
  readonly dependencies: EntryDependency[];
}

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

export interface RegistryEnvelopeBase {
  readonly format: "sentropic.registry-entry/v1";
  readonly contractVersion: string;
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly entryVersion: string;
  readonly publisher: { readonly packageName: string; readonly packageVersion: string };
  readonly compatibility: RegistryCompatibility;
  readonly parameters: RegistryParameters;
  readonly bindings: readonly RegistryBinding[];
  readonly assets: readonly RegistryAsset[];
  readonly extensions?: Record<string, unknown>;
  readonly requiredExtensions?: readonly string[];
}

/**
 * §5.2 tagged union on `kind`: exactly one kind payload is present,
 * the others are absent. `ontology` is the G0 addition with its §5.3 payload.
 */
export type RegistryEnvelope =
  | (RegistryEnvelopeBase & {
      readonly kind: "skill";
      readonly skill: SkillPayload;
      readonly mcp?: never;
      readonly ontology?: never;
    })
  | (RegistryEnvelopeBase & {
      readonly kind: "mcp";
      readonly mcp: McpPayload;
      readonly skill?: never;
      readonly ontology?: never;
    })
  | (RegistryEnvelopeBase & {
      readonly kind: "ontology";
      readonly ontology: OntologyPayload;
      readonly skill?: never;
      readonly mcp?: never;
    });

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
  /**
   * Whole composed selection, native effective-setting order: the complete
   * effective `Setting[]` value (S-COMPILED), retaining rule, severity,
   * classification and permitted options verbatim.
   */
  readonly settings: readonly CompiledSetting[];
  readonly severityPolicyDigest: Digest;
  readonly rules: readonly SelectionRuleRow[];
}

/**
 * §5.3 public rule sheet: selections required, one row per
 * (phase, readinessPolicy) covered by the entry qualification scope.
 */
export interface PublicRuleSheetRef {
  readonly sheetPin: Pin;
  readonly ruleIds: readonly string[];
  readonly selections: readonly SelectionMetadata[];
}

/** §5.3 private rule sheet: no selections array; selection stays owner-side. */
export interface PrivateRuleSheetRef {
  readonly sheetPin: Pin;
  readonly ruleIds: readonly string[];
  readonly selections?: never;
}

/** Rule sheet reference, visibility-selected by the enclosing payload arm. */
export type RuleSheetRef = PublicRuleSheetRef | PrivateRuleSheetRef;

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

/**
 * §5.3 lineage: the same discriminated union as §1.4, keyed by the enclosing
 * payload visibility. No `scope` wrapper, no extra `lineage` nesting.
 */
export type PayloadLineage = PublicLineage | PrivateLineage;

export interface OntologyPayloadBase {
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
  readonly lifecycle: Lifecycle;
  readonly deprecatedReason?: string;
  readonly deprecatedAt?: string;
  readonly supersededBy?: Pin;
  readonly provenance: ProvenanceRecord;
  readonly licenceClosure?: LicenceClosure;
  readonly coverage?: CoverageRecord;
  readonly conflictPolicy: string;
  readonly completeness: Completeness;
  readonly corpusRef: { readonly ref: string; readonly digest: Digest };
  readonly receipts: readonly Receipt[];
  readonly migrations: readonly string[];
  readonly consumers: readonly string[];
  readonly compatibility: { readonly renderer: string; readonly adapter: string };
  readonly linkedTools: readonly string[];
  readonly artifactBinding: ArtifactBinding;
}

/**
 * §5.3 ontology payload, discriminated by the enclosing visibility:
 * public entries carry the public lineage container and required selections;
 * private entries carry exactly `PrivateLineage` and no selections array.
 */
export type OntologyPayload =
  | (OntologyPayloadBase & {
      readonly visibility: "public";
      readonly lineage: PublicLineage;
      readonly ruleSheets: readonly PublicRuleSheetRef[];
    })
  | (OntologyPayloadBase & {
      readonly visibility: `private:${string}`;
      readonly lineage: PrivateLineage;
      readonly ruleSheets: readonly PrivateRuleSheetRef[];
    });

/** Pinned corpus authority tag for parity claims ([BP] profile-corpus-v1.0.0). */
export const PINNED_CORPUS_AUTHORITY_TAG = "profile-corpus-v1.0.0";

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

/**
 * S-COMPILED pinned object, reused verbatim ([BC@63a9258:src/profile/lint-contracts.ts:8–12]).
 * `mechanismVersion` is the literal `"1"`; every compiled rule keeps required
 * `id, phase, select, assert, code, message, classification` with only optional
 * `repairRecipe, bindings`; a compiled rule never carries `options`.
 */
export type CompiledLintOptions = CompiledLintOptionsNative;

export type CompiledLintEvidence =
  | {
      readonly scope: "public";
      readonly compiledOptions: CompiledLintOptions;
      /** Complete effective native settings (S-COMPILED `Setting[]`), verbatim. */
      readonly settings: readonly CompiledSetting[];
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
