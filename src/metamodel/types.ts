import type { ConfidentialityDenyListV1 } from "../../engram-memory/dist/privacy/deny-list.js";
import type {
  CrossLineageCompositionPin,
  H2AMandateEnvelope,
  LineageId,
  MetamodelVersion,
  OntologyTemplateEnvelopeRef,
  Sha256Digest,
} from "../metamodel-contracts.js";
import type { MappingFile, Pin } from "../ontology-guardian/types.js";
import type {
  OntologyHardeningPolicy,
  OntologyNodeTypeLinking,
  OntologyRegistrySpec,
  OntologyVisualEncoding,
} from "../types.js";
import type { MetamodelDiagnostic } from "./diagnostics.js";

export type {
  CrossLineageCompositionPin,
  H2AMandateEnvelope,
  LineageId,
  MetamodelVersion,
  OntologyTemplateEnvelopeRef,
  Sha256Digest,
} from "../metamodel-contracts.js";

/** Closed scalar attribute kinds supported by Metamodel v1 (Spec 0 §1.4). */
export type AttributeScalarKind =
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "enum"
  | "timestamp"
  | "digest"
  | "ref";

/** Typed attribute declaration for node types, relation types, collections, and records (Spec 0 §1.4). */
export type AttributeDecl =
  | {
      readonly kind: AttributeScalarKind;
      readonly required?: boolean;
      readonly description?: string;
      readonly values?: readonly string[];
      readonly pattern?: string;
      readonly minLength?: number;
      readonly maxLength?: number;
      readonly min?: number;
      readonly max?: number;
      readonly targetTypes?: readonly string[];
    }
  | {
      readonly kind: "collection";
      readonly required?: boolean;
      readonly description?: string;
      readonly minItems?: number;
      readonly maxItems?: number;
      readonly item: AttributeDecl;
    }
  | {
      readonly kind: "record";
      readonly required?: boolean;
      readonly description?: string;
      readonly attributes: Readonly<Record<string, AttributeDecl>>;
    };

/** Closed authority vocabulary for state transitions and admission controls (Spec 0 §1.4). */
export type TransitionAndAdmissionAuthority =
  | "author"
  | "track-control"
  | "third-party-reviewer"
  | "h2a-mandate"
  | "mandated-act"
  | "own-act-human";

/** Directed state transition rule inside a `StateMachineDecl` (Spec 0 §1.4). */
export interface StateTransitionDecl {
  readonly from: readonly string[];
  readonly to: readonly string[];
  readonly requires?: readonly string[];
  readonly authority?: TransitionAndAdmissionAuthority;
}

/** Deterministic finite state machine declaration (Spec 0 §1.4). */
export interface StateMachineDecl {
  readonly states: readonly string[];
  readonly initial_state: string;
  readonly terminal_states?: readonly string[];
  readonly transitions: readonly StateTransitionDecl[];
}

/** D1 admission disposition modes declared by templates (Spec 0 §1.4). */
export type NodeAdmissionMode =
  | "bounded-auto"
  | "promotion-third-party-review"
  | "mandate-gated"
  | "mandated-act"
  | "own-act-human";

/** Scoped admission policy for a node type (Spec 0 §1.4). */
export interface NodeAdmissionPolicyDecl {
  /** Default D1=borne-review disposition declared by templates and enforced by the lineage's control master. */
  readonly mode: NodeAdmissionMode;
  readonly third_party_distinct_from_author?: boolean;
  /** Optional generic overrides keyed by hierarchy rank ("0".."N"), operation kind, or "<axis>:<from>-><to>". */
  readonly by_rank?: Readonly<Record<string, NodeAdmissionMode>>;
  readonly by_operation?: Readonly<Record<string, NodeAdmissionMode>>;
  readonly by_transition?: Readonly<Record<string, NodeAdmissionMode>>;
}

/** Node type declaration in a Metamodel v1 template (Spec 0 §1.4). */
export interface MetamodelNodeTypeDecl {
  readonly definition?: string;
  readonly id_prefix?: string;
  readonly aliases?: readonly string[];
  readonly source_backed?: boolean;
  readonly registry?: string;
  readonly attributes?: Readonly<Record<string, AttributeDecl>>;
  readonly state_machine?: StateMachineDecl;
  /** Orthogonal state axes on one node type (e.g. specification + realization + reporting axes). */
  readonly state_machines?: Readonly<Record<string, StateMachineDecl>>;
  readonly admission_policy?: NodeAdmissionPolicyDecl;
  readonly linking?: OntologyNodeTypeLinking;
  /** Hashed in presentation_hash ONLY; excluded from templateDigestSha256 (profile_hash). */
  readonly visual_encoding?: OntologyVisualEncoding;
}

/** Relation type declaration in a Metamodel v1 template (Spec 0 §1.4). */
export interface MetamodelRelationTypeDecl {
  readonly description?: string;
  readonly source_types: readonly string[];
  readonly target_types: readonly string[];
  readonly cardinality?: {
    readonly out?: { readonly min: number; readonly max: number | "many" };
    readonly in?: { readonly min: number; readonly max: number | "many" };
  };
  readonly requires_evidence?: boolean;
  readonly assertion_basis?: readonly string[];
  readonly derivation_methods?: readonly string[];
  readonly attributes?: Readonly<Record<string, AttributeDecl>>;
  readonly hierarchy?: {
    readonly id: string;
    readonly shape: "tree" | "dag";
    readonly parent_role: "source" | "target";
    readonly child_role: "source" | "target";
  };
}

/**
 * Generic, domain-neutral governance policy constructs (M1 under T-M-C, Spec 0 §1.4).
 * Every level, mode, stage, status, evidence kind, risk category, and response is an open string
 * supplied by the template; engram holds zero closed lists of Track or h2a domain types.
 */
export interface DomainPoliciesDecl {
  /** Ranked hierarchy levels (rank >= 0, optional modes, rollup & parent requirements). */
  readonly levels?: ReadonlyArray<{
    readonly id: string;
    readonly rank: number;
    readonly modes?: readonly string[];
    readonly requires_parent?: boolean;
    readonly rollup?: boolean;
    readonly closure_gate_ref?: string;
  }>;
  /** Transverse reference axes orthogonal to the tree hierarchy. */
  readonly cross_cutting_axes?: Readonly<
    Record<string, { readonly attribute: string; readonly pattern?: string; readonly inherited_downward?: boolean }>
  >;
  /** Conditional parent-child nesting matrix constrained by parent level/mode and child subkind/attributes. */
  readonly nesting_matrix?: ReadonlyArray<{
    readonly parent_level: string;
    readonly parent_modes?: readonly string[];
    readonly allowed_child_levels: readonly string[];
    readonly child_subkind?: string;
    readonly when_attributes?: Readonly<Record<string, readonly string[]>>;
  }>;
  /** Optional sub-stage refinements rolling up to parent stages and witnessed by link/artifact kinds. */
  readonly stage_refinements?: ReadonlyArray<{
    readonly parent_stage: string;
    readonly sub_stages: readonly string[];
    readonly witness_link_kinds?: readonly string[];
  }>;
  /** Actor autonomy bounds, per-level creation/stage ceilings, mandated-act vs own-act-human gates. */
  readonly autonomy_policy?: {
    readonly actor_classes: readonly string[];
    readonly max_autonomous_create_rank?: number;
    readonly max_autonomous_create_level?: string;
    readonly autonomous_stage_ceiling_by_level?: Readonly<Record<string, string>>;
    readonly mandated_act_operations?: readonly string[];
    readonly mandated_act_proof_sources?: readonly string[];
    readonly own_act_human_operations?: readonly string[];
    readonly overlay_precedence?: "tighten-only";
  };
  /** Non-delegable acceptance / UAT gate definitions. */
  readonly acceptance_gates?: Readonly<
    Record<
      string,
      {
        readonly applies_to_levels: readonly string[];
        readonly authority: "own-act-human" | "mandated-act" | "third-party-reviewer";
        readonly designated_owner_attribute?: string;
        readonly required_actor_class?: string;
        readonly non_waivable_evidence_kinds?: readonly string[];
        readonly require_all_children_terminal?: boolean;
        readonly freshness_anchor_equality?: {
          readonly receipt_field: string;
          readonly target_field: string;
        };
      }
    >
  >;
  /** Per-level / subkind duration bounds, clock start/stop triggers, and rebaseline decision rules. */
  readonly timeboxes?: ReadonlyArray<{
    readonly applies_to_level: string;
    readonly subkind?: string;
    readonly target_days?: number;
    readonly hard_ceiling_days: number;
    readonly clock_start_trigger: string;
    readonly clock_stop_triggers: readonly string[];
    readonly rebaseline_decision_kind?: string;
    readonly overdue_escalation?: string;
  }>;
  /** Append-only ETA journal, source qualification, slip recording, and measured-velocity provenance policy. */
  readonly eta_policy?: {
    readonly eligible_ranks?: readonly number[];
    readonly max_active_slots_per_item?: number;
    readonly source_kinds: readonly string[];
    readonly measured_provenance_required_fields?: readonly string[];
    readonly append_only_slip_journal: boolean;
    readonly rebaseline_requires_decision?: boolean;
  };
  /** Likelihood x impact risk matrix, contiguous severity bands, response/actor constraints, review ceilings. */
  readonly risk_policy?: {
    readonly likelihood_scale: readonly number[];
    readonly impact_scale: readonly number[];
    readonly severity_bands: ReadonlyArray<{
      readonly id: string;
      readonly min_score: number;
      readonly max_score: number;
    }>;
    readonly categories: readonly string[];
    readonly responses: readonly string[];
    readonly forbid_actor_classes_by_response?: Readonly<Record<string, readonly string[]>>;
    readonly max_review_validity_days_by_band?: Readonly<Record<string, number>>;
    readonly external_register_max_age_days?: number;
    readonly sensitivity_impact_floors?: Readonly<Record<string, number>>;
  };
  /** Pure read-time remapping from legacy role/tag tokens to canonical hierarchy levels + subkinds. */
  readonly legacy_role_remap?: Readonly<
    Record<string, { readonly target_level: string; readonly subkind?: string; readonly read_only: true }>
  >;
  /** Named declarative invariants referenced by control diagnostics. */
  readonly invariants?: ReadonlyArray<{
    readonly id: string;
    readonly summary: string;
    readonly scope: string;
    readonly severity: "error" | "warning";
  }>;
}

/** Exact per-PR `.track/` file-shape contract (D29=both, Spec 0 §1.4). */
export interface TrackPrFileProjectionDecl {
  readonly kind: "track-pr-slice";
  readonly content_mode: "both";
  readonly root_dir: ".track";
  readonly event_journal: {
    readonly relative_path_template: string;
    readonly format: "track-events-jsonl/v1";
    readonly forbid_header_lines: true;
    readonly aggregates: readonly string[];
    readonly event_types: readonly string[];
    readonly order_by: readonly ["stream_seq"];
    readonly frame_integrity: "positional-prevhash-and-aggregate-seq";
    readonly envelope_contract: {
      readonly core_fields: readonly ["id", "type", "aggregate", "aggregateId", "at", "by", "payload"];
      readonly optional_core_fields: readonly ["prov", "clientToken", "cmdId", "cmd"];
      readonly frame_fields: readonly ["seq", "prevHash", "contentHash"];
    };
  };
  readonly head_anchor: {
    readonly relative_path_template: string;
    readonly format: "track-head/v1";
  };
  readonly state_snapshot: {
    readonly relative_path_template: string;
    readonly schema: "track.state-snapshot/v1" | "track.snapshot/v1";
    readonly include_collections: readonly string[];
    readonly report_sections?: readonly string[];
    readonly status_vocabulary: readonly string[];
    readonly stage_vocabulary: readonly string[];
    readonly remaining_work_realizations: readonly string[];
  };
  readonly owner_table_inputs?: {
    readonly required_folded_collections: readonly string[];
    readonly required_event_stream_lookbacks: readonly string[];
    readonly options_fields: readonly string[];
    readonly confidentiality_policy_contract: "track-owner-table-policy/v1";
  };
  readonly link_fingerprint_sidecar: {
    readonly relative_path_template: string;
    readonly schema: "engram.track-pr-link-fingerprint/v1";
    readonly hash_algorithm: "sha256-rfc8785";
  };
}

/** Exact `.h2a/` harness overlay file-shape contract (D31, Point 4B, Spec 0 §1.4). */
export interface H2aOverlayFileProjectionDecl {
  readonly kind: "h2a-harness-overlay";
  readonly root_dir: ".h2a";
  readonly relative_path_template: string;
  readonly relative_path_templates?: {
    readonly repo: string;
    readonly workspace: string;
    readonly worktree: string;
  };
  readonly precedence?: "tighten-only";
  readonly format: "json" | "yaml";
  readonly include_node_types: readonly string[];
  readonly order_by: readonly ("entity_id")[];
  readonly projected_fields: readonly string[];
}

/** Union of supported file projection declarations in Metamodel v1. */
export type FileProjectionDecl = TrackPrFileProjectionDecl | H2aOverlayFileProjectionDecl;

/** Normative Metamodel v1 template document (Spec 0 §1.4). */
export interface MetamodelTemplateDocument {
  readonly metamodel_version: "engram.metamodel/v1";
  readonly lineage: LineageId;
  readonly id: string;
  readonly version: string;
  readonly default_language?: string;
  readonly parent_pin?: Pin;
  readonly mapping_pin?: Pin;
  readonly composed_lineage_pins?: readonly CrossLineageCompositionPin[];
  readonly registries?: Readonly<Record<string, OntologyRegistrySpec>>;
  readonly hardening?: OntologyHardeningPolicy;
  readonly presentation?: Readonly<Record<string, unknown>>;
  readonly presentation_hash?: Sha256Digest;
  readonly node_types: Readonly<Record<string, MetamodelNodeTypeDecl>>;
  readonly relation_types?: Readonly<Record<string, MetamodelRelationTypeDecl>>;
  readonly domain_policies?: DomainPoliciesDecl;
  readonly file_projections?: Readonly<Record<string, FileProjectionDecl>>;
}

/** Optional mandate and sole-author verification context (Spec 0 §2.2). */
export interface MetamodelAuthContext {
  readonly writerMandate?: H2AMandateEnvelope | null;
  readonly callerProvider?: string;
  readonly artifactKind?: string;
  readonly bodyKind?: string;
  readonly now?: string | number;
  readonly verifySignature?: (mandate: H2AMandateEnvelope) => boolean;
  readonly lockedTemplates?: ReadonlyArray<{
    readonly lineage: LineageId;
    readonly templateId: string;
    readonly templateVersion: string;
  }>;
}

/** Caller-supplied digests to verify against recomputed RFC 8785 JCS SHA-256 digests (Spec 0 §2.4). */
export interface MetamodelExpectedDigests {
  readonly templateDigestSha256?: string;
  readonly presentationDigest?: string;
  readonly rawSha256?: string;
}

/** Registered template entry supplied via validation context for registry, composition, and SemVer checks. */
export interface RegisteredTemplateRecord {
  readonly lineage: LineageId;
  readonly templateId: string;
  readonly templateVersion: string;
  readonly templateDigestSha256: Sha256Digest;
  readonly presentationDigest?: Sha256Digest;
  readonly nodeTypeIds?: readonly string[];
  readonly composedLineagePins?: readonly CrossLineageCompositionPin[];
  readonly document?: MetamodelTemplateDocument;
}

/** Explicit rename declaration checked against `mapping_pin` and `mappingFile`. */
export interface DeclaredBreakingRename {
  readonly from: string;
  readonly to: string;
}

/** Optional harness overlay delta context checked for `.h2a/` non-interference (Spec 0 §2.5). */
export interface MetamodelOverlayCheckContext {
  readonly targetPaths?: readonly string[];
  readonly relaxesCeilings?: boolean;
  readonly mutatesLineages?: readonly LineageId[];
}

/** Optional D7 confidentiality/PII deny-list screening overrides (Spec 0 §3.2). */
export interface MetamodelPrivacyContext {
  readonly denyList?: ConfidentialityDenyListV1;
  readonly termSalt?: string;
  readonly customMatcher?: (value: string, path: string) => string | null;
}

/** Optional verification context supplied to `validateTemplateAgainstMetamodel`. */
export interface MetamodelValidationContext {
  readonly auth?: MetamodelAuthContext;
  readonly expectedDigests?: MetamodelExpectedDigests;
  readonly registry?: readonly RegisteredTemplateRecord[];
  readonly mappingFile?: MappingFile;
  readonly declaredRenames?: readonly DeclaredBreakingRename[];
  readonly overlayCheck?: MetamodelOverlayCheckContext;
  readonly privacy?: MetamodelPrivacyContext;
}

/** Pure acceptor / refuser result of `validateTemplateAgainstMetamodel` (Spec 0 §3.1). */
export type MetamodelValidationResult =
  | {
      readonly status: "accepted";
      readonly template: MetamodelTemplateDocument;
      readonly templateDigestSha256: Sha256Digest;
      readonly presentationDigest: Sha256Digest;
      readonly rawSha256: Sha256Digest | null;
      readonly diagnostics: readonly MetamodelDiagnostic[];
      readonly warnings: readonly MetamodelDiagnostic[];
    }
  | {
      readonly status: "refused-metamodel-invalid";
      readonly diagnostics: readonly MetamodelDiagnostic[];
      readonly warnings: readonly MetamodelDiagnostic[];
    };
