import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { stringify as stringifyYaml } from "yaml";
import { createConfidentialityDenyListV1 } from "../engram-memory/dist/privacy/deny-list.js";
import {
  METAMODEL_DIAGNOSTIC_CODES,
  type MetamodelDiagnosticCode,
} from "../src/metamodel/diagnostics.js";
import type {
  MetamodelTemplateDocument,
  MetamodelValidationContext,
} from "../src/metamodel/types.js";
import { validateTemplateAgainstMetamodel } from "../src/metamodel/validate.js";
import { canonicalizeConfinedPath } from "../src/metamodel/validate-projections.js";
import type { H2AMandateEnvelope, Sha256Digest } from "../src/metamodel-contracts.js";
import { ARCHI_V1, ARCHI_V1_PIN } from "../src/ontology-guardian/archi-profile.js";
import { fromInternalDigest, semanticProfileDigest, toInternalDigest } from "../src/ontology-guardian/digests.js";
import { deepFreeze, normalizeOntologyProfile } from "../src/ontology-profile.js";
import { validateProfileExtraction } from "../src/profile-validate.js";
import type { Extraction, OntologyProfile } from "../src/types.js";

const ARCHI_V1_SHA256: Sha256Digest = fromInternalDigest(ARCHI_V1_PIN.contentDigest);
const ARCHI_V1_ENTITY_IDS = ARCHI_V1.declaration.entityTypes.map((entity) => entity.id);

function buildCompleteTrackTemplate(): MetamodelTemplateDocument {
  return {
    metamodel_version: "engram.metamodel/v1",
    lineage: "track",
    id: "sentropic.agile-product",
    version: "1.0.0",
    default_language: "en",
    composed_lineage_pins: [],
    node_types: {
      WorkItem: {
        definition: "Trackable unit of product work across specification and realization axes.",
        id_prefix: "WI",
        aliases: ["work-item", "deliverable-item"],
        source_backed: true,
        attributes: {
          title: {
            kind: "string",
            required: true,
            minLength: 3,
            maxLength: 160,
            pattern: "^[A-Za-z0-9 _.:/-]+$",
            description: "Human-readable title of the work item.",
          },
          priority_score: {
            kind: "number",
            min: 0,
            max: 100,
          },
          rank: {
            kind: "integer",
            required: true,
            min: 0,
            max: 3,
          },
          is_expedited: {
            kind: "boolean",
          },
          subkind: {
            kind: "enum",
            values: ["standard", "quick-task", "spike"],
          },
          created_at: {
            kind: "timestamp",
            required: true,
          },
          content_digest: {
            kind: "digest",
          },
          parent_item: {
            kind: "ref",
            targetTypes: ["WorkItem"],
          },
          acceptance_tags: {
            kind: "collection",
            minItems: 0,
            maxItems: 12,
            item: {
              kind: "string",
              minLength: 1,
              maxLength: 40,
            },
          },
          archi_asset_ref: {
            kind: "record",
            description: "Inert architecture asset locator with zero compile-time cross-lineage coupling.",
            attributes: {
              profile: { kind: "enum", required: true, values: ["archi@1", "archi@2"] },
              entity_id: { kind: "string", required: true, minLength: 1, maxLength: 120 },
            },
          },
        },
        state_machines: {
          specification: {
            states: ["request-recorded", "scoped", "specified", "withdrawn"],
            initial_state: "request-recorded",
            terminal_states: ["withdrawn"],
            transitions: [
              { from: ["request-recorded"], to: ["scoped"], authority: "author" },
              { from: ["scoped"], to: ["specified"], authority: "track-control" },
              { from: ["request-recorded", "scoped", "specified"], to: ["withdrawn"], authority: "mandated-act" },
            ],
          },
          realization: {
            states: ["to-do", "in-progress", "in-review", "verified", "acceptance-pending", "accepted", "closed"],
            initial_state: "to-do",
            terminal_states: ["closed"],
            transitions: [
              { from: ["to-do"], to: ["in-progress"], authority: "author" },
              { from: ["in-progress"], to: ["in-review"], authority: "author" },
              { from: ["in-review"], to: ["verified"], requires: ["verification_run"], authority: "third-party-reviewer" },
              { from: ["verified"], to: ["acceptance-pending"], authority: "track-control" },
              { from: ["acceptance-pending"], to: ["accepted"], requires: ["uat_receipt"], authority: "own-act-human" },
              { from: ["accepted", "verified"], to: ["closed"], authority: "mandated-act" },
            ],
          },
        },
        admission_policy: {
          mode: "bounded-auto",
          third_party_distinct_from_author: true,
          by_rank: {
            "0": "mandated-act",
            "1": "mandated-act",
            "2": "bounded-auto",
            "3": "bounded-auto",
          },
          by_operation: {
            "item.create": "bounded-auto",
            "item.reparent": "mandated-act",
            "acceptance.uat-recorded": "own-act-human",
          },
          by_transition: {
            "realization:acceptance-pending->accepted": "own-act-human",
            "realization:in-review->verified": "promotion-third-party-review",
          },
        },
        visual_encoding: {
          shape: "box",
          fill: "solid",
          border: "normal",
          color_hex: "#2B6CB0",
        },
      },
      DecisionDossier: {
        definition: "Project governance decision record with explicit settlement lifecycle.",
        id_prefix: "DEC",
        aliases: ["decision"],
        attributes: {
          topic: { kind: "string", required: true, minLength: 3, maxLength: 200 },
          verdict: { kind: "enum", values: ["go", "no-go", "defer"] },
        },
        state_machine: {
          states: ["draft", "open", "settled", "superseded"],
          initial_state: "draft",
          terminal_states: ["settled", "superseded"],
          transitions: [
            { from: ["draft"], to: ["open"], authority: "author" },
            { from: ["open"], to: ["settled"], authority: "mandated-act" },
            { from: ["settled"], to: ["superseded"], authority: "mandated-act" },
          ],
        },
        admission_policy: {
          mode: "mandated-act",
        },
        visual_encoding: {
          shape: "diamond",
          fill: "hollow",
          border: "bold",
          color_hex: "#805AD5",
        },
      },
      RiskEntry: {
        definition: "Tracked project risk evaluated on likelihood and impact scales.",
        id_prefix: "RSK",
        attributes: {
          likelihood: { kind: "integer", required: true, min: 1, max: 5 },
          impact: { kind: "integer", required: true, min: 1, max: 5 },
          response: { kind: "enum", required: true, values: ["mitigate", "avoid", "transfer", "accept"] },
        },
        state_machine: {
          states: ["identified", "active", "mitigated", "closed"],
          initial_state: "identified",
          terminal_states: ["closed"],
          transitions: [
            { from: ["identified"], to: ["active"], authority: "author" },
            { from: ["active"], to: ["mitigated"], authority: "track-control" },
            { from: ["mitigated", "active"], to: ["closed"], authority: "mandated-act" },
          ],
        },
      },
    },
    relation_types: {
      child_of: {
        description: "Hierarchical parent-child containment between work items.",
        source_types: ["WorkItem"],
        target_types: ["WorkItem"],
        cardinality: {
          out: { min: 0, max: 1 },
          in: { min: 0, max: "many" },
        },
        requires_evidence: false,
        assertion_basis: ["declared"],
        derivation_methods: ["explicit"],
        hierarchy: {
          id: "work-item-tree",
          shape: "tree",
          parent_role: "target",
          child_role: "source",
        },
      },
      blocks: {
        description: "Dependency edge indicating one work item blocks another.",
        source_types: ["WorkItem"],
        target_types: ["WorkItem"],
        cardinality: {
          out: { min: 0, max: "many" },
          in: { min: 0, max: "many" },
        },
        requires_evidence: true,
        attributes: {
          rationale: { kind: "string", required: true, minLength: 4, maxLength: 300 },
          recorded_at: { kind: "timestamp" },
        },
        hierarchy: {
          id: "dependency-dag",
          shape: "dag",
          parent_role: "source",
          child_role: "target",
        },
      },
      governs: {
        description: "Links a settled decision dossier to the work items or risks it governs.",
        source_types: ["DecisionDossier"],
        target_types: ["WorkItem", "RiskEntry"],
        cardinality: {
          out: { min: 1, max: "many" },
          in: { min: 0, max: "many" },
        },
      },
    },
    domain_policies: {
      levels: [
        { id: "initiative", rank: 0, modes: ["build", "run"], requires_parent: false, rollup: true },
        { id: "epic", rank: 1, modes: ["build", "run"], requires_parent: true, rollup: true },
        { id: "feature", rank: 2, modes: ["build"], requires_parent: true, rollup: true, closure_gate_ref: "feature_uat" },
        { id: "task", rank: 3, requires_parent: true, rollup: false },
      ],
      cross_cutting_axes: {
        control_account: {
          attribute: "wbs_code",
          pattern: "^WBS-[0-9]{2}(\\.[0-9][0-9])*$",
          inherited_downward: true,
        },
      },
      nesting_matrix: [
        {
          parent_level: "initiative",
          parent_modes: ["build", "run"],
          allowed_child_levels: ["epic"],
        },
        {
          parent_level: "epic",
          parent_modes: ["build"],
          allowed_child_levels: ["feature"],
        },
        {
          parent_level: "feature",
          parent_modes: ["build"],
          allowed_child_levels: ["task"],
          child_subkind: "standard",
          when_attributes: { subkind: ["standard", "quick-task"] },
        },
      ],
      stage_refinements: [
        {
          parent_stage: "in-implementation",
          sub_stages: ["coding", "unit-testing"],
          witness_link_kinds: ["pr_link", "commit_link"],
        },
      ],
      autonomy_policy: {
        actor_classes: ["human", "agent", "conductor"],
        max_autonomous_create_rank: 2,
        max_autonomous_create_level: "feature",
        autonomous_stage_ceiling_by_level: {
          feature: "verified",
          task: "closed",
        },
        mandated_act_operations: ["item.create", "item.reparent", "decision.settle"],
        mandated_act_proof_sources: ["agreed_demand", "settled_decision"],
        own_act_human_operations: ["acceptance.uat-recorded"],
        overlay_precedence: "tighten-only",
      },
      acceptance_gates: {
        feature_uat: {
          applies_to_levels: ["feature"],
          authority: "own-act-human",
          designated_owner_attribute: "uatOwner",
          required_actor_class: "human",
          non_waivable_evidence_kinds: ["verification_run", "uat_receipt"],
          require_all_children_terminal: true,
          freshness_anchor_equality: {
            receipt_field: "uat.commit",
            target_field: "item.realizedCommit",
          },
        },
      },
      timeboxes: [
        {
          applies_to_level: "feature",
          subkind: "standard",
          target_days: 10,
          hard_ceiling_days: 20,
          clock_start_trigger: "realization:in-progress",
          clock_stop_triggers: ["realization:accepted", "realization:closed"],
          rebaseline_decision_kind: "schedule-rebaseline",
          overdue_escalation: "flag-conductor",
        },
      ],
      eta_policy: {
        eligible_ranks: [1, 2],
        max_active_slots_per_item: 2,
        source_kinds: ["measured-velocity", "human-commitment"],
        measured_provenance_required_fields: ["sampleWindowDays", "completedCount", "velocityRate"],
        append_only_slip_journal: true,
        rebaseline_requires_decision: true,
      },
      risk_policy: {
        likelihood_scale: [1, 2, 3, 4, 5],
        impact_scale: [1, 2, 3, 4, 5],
        severity_bands: [
          { id: "low", min_score: 1, max_score: 4 },
          { id: "medium", min_score: 5, max_score: 9 },
          { id: "high", min_score: 10, max_score: 16 },
          { id: "critical", min_score: 17, max_score: 25 },
        ],
        categories: ["schedule", "security", "architecture", "dependency"],
        responses: ["mitigate", "avoid", "transfer", "accept"],
        forbid_actor_classes_by_response: {
          accept: ["agent"],
          transfer: ["agent"],
        },
        max_review_validity_days_by_band: {
          low: 90,
          medium: 45,
          high: 14,
          critical: 7,
        },
        external_register_max_age_days: 30,
        sensitivity_impact_floors: {
          regulated: 4,
          public: 1,
        },
      },
      legacy_role_remap: {
        legacy_wp: { target_level: "epic", subkind: "standard", read_only: true },
        legacy_story: { target_level: "feature", read_only: true },
      },
      invariants: [
        {
          id: "inv-uat-human-only",
          summary: "Feature acceptance receipts must be recorded by the designated human owner.",
          scope: "acceptance_gates.feature_uat",
          severity: "error",
        },
      ],
    },
    file_projections: {
      default_pr_slice: {
        kind: "track-pr-slice",
        content_mode: "both",
        root_dir: ".track",
        event_journal: {
          relative_path_template: ".track/events.jsonl",
          format: "track-events-jsonl/v1",
          forbid_header_lines: true,
          aggregates: ["item", "decision", "risk"],
          event_types: ["workspace.ontology-bound", "item.created", "decision.settled", "acceptance.uat-recorded"],
          order_by: ["stream_seq"],
          frame_integrity: "positional-prevhash-and-aggregate-seq",
          envelope_contract: {
            core_fields: ["id", "type", "aggregate", "aggregateId", "at", "by", "payload"],
            optional_core_fields: ["prov", "clientToken", "cmdId", "cmd"],
            frame_fields: ["seq", "prevHash", "contentHash"],
          },
        },
        head_anchor: {
          relative_path_template: ".track/head.json",
          format: "track-head/v1",
        },
        state_snapshot: {
          relative_path_template: ".track/state.snapshot.json",
          schema: "track.state-snapshot/v1",
          include_collections: ["items", "decisions", "risks"],
          status_vocabulary: ["on-track", "waiting", "blocked", "done", "withdrawn"],
          stage_vocabulary: [
            "request-recorded",
            "scoped",
            "specified",
            "in-implementation",
            "in-review",
            "verified",
            "acceptance-pending",
            "accepted",
            "closed",
            "withdrawn",
          ],
          remaining_work_realizations: ["to-do", "in-progress"],
        },
        owner_table_inputs: {
          required_folded_collections: ["items", "decisions", "risks"],
          required_event_stream_lookbacks: ["item.created", "acceptance.uat-recorded"],
          options_fields: ["baselineCommit", "workspace", "now", "policy"],
          confidentiality_policy_contract: "track-owner-table-policy/v1",
        },
        link_fingerprint_sidecar: {
          relative_path_template: ".track/engram-link.json",
          schema: "engram.track-pr-link-fingerprint/v1",
          hash_algorithm: "sha256-rfc8785",
        },
      },
      factual_report_snapshot: {
        kind: "track-pr-slice",
        content_mode: "both",
        root_dir: ".track",
        event_journal: {
          relative_path_template: ".track/pr/{prBranchSlug}/events.jsonl",
          format: "track-events-jsonl/v1",
          forbid_header_lines: true,
          aggregates: ["item", "decision"],
          event_types: ["workspace.ontology-bound", "item.created"],
          order_by: ["stream_seq"],
          frame_integrity: "positional-prevhash-and-aggregate-seq",
          envelope_contract: {
            core_fields: ["id", "type", "aggregate", "aggregateId", "at", "by", "payload"],
            optional_core_fields: ["prov", "clientToken", "cmdId", "cmd"],
            frame_fields: ["seq", "prevHash", "contentHash"],
          },
        },
        head_anchor: {
          relative_path_template: ".track/pr/{prBranchSlug}/head.json",
          format: "track-head/v1",
        },
        state_snapshot: {
          relative_path_template: ".track/pr/{prBranchSlug}/report.snapshot.json",
          schema: "track.snapshot/v1",
          include_collections: ["items", "decisions"],
          report_sections: ["baseline", "report.buckets", "report.decisions", "wpTotals"],
          status_vocabulary: ["on-track", "done"],
          stage_vocabulary: ["request-recorded", "in-implementation", "closed"],
          remaining_work_realizations: ["to-do", "in-progress"],
        },
        link_fingerprint_sidecar: {
          relative_path_template: ".track/pr/{prBranchSlug}/engram-link.json",
          schema: "engram.track-pr-link-fingerprint/v1",
          hash_algorithm: "sha256-rfc8785",
        },
      },
    },
  };
}

function buildCompleteH2aTemplate(trackDigest: Sha256Digest): MetamodelTemplateDocument {
  return {
    metamodel_version: "engram.metamodel/v1",
    lineage: "h2a",
    id: "sentropic.h2a-harness-and-skills",
    version: "1.0.0",
    default_language: "en",
    composed_lineage_pins: [
      {
        importAlias: "archi_v1",
        lineage: "archi",
        templateId: "archi",
        templateVersion: "1.0.0",
        templateDigestSha256: ARCHI_V1_SHA256,
      },
      {
        importAlias: "track_agile",
        lineage: "track",
        templateId: "sentropic.agile-product",
        templateVersion: "1.0.0",
        templateDigestSha256: trackDigest,
      },
    ],
    node_types: {
      HarnessRule: {
        definition: "Tighten-only master harness governance rule.",
        id_prefix: "HR",
        aliases: ["harness-rule"],
        attributes: {
          rule_key: { kind: "string", required: true, minLength: 2, maxLength: 80 },
          enforcement: { kind: "enum", required: true, values: ["deny", "warn", "require-mandate"] },
          target_work_item: { kind: "ref", targetTypes: ["track_agile:WorkItem"] },
        },
        state_machine: {
          states: ["draft", "active", "retired"],
          initial_state: "draft",
          terminal_states: ["retired"],
          transitions: [
            { from: ["draft"], to: ["active"], authority: "h2a-mandate" },
            { from: ["active"], to: ["retired"], authority: "h2a-mandate" },
          ],
        },
        admission_policy: {
          mode: "mandate-gated",
        },
        linking: {
          preset: "gazetteer-exact",
          normalize: { builtin: ["case_fold", "collapse_ws"] },
        },
        visual_encoding: {
          shape: "hexagon",
          fill: "solid",
          border: "bold",
          color_hex: "#2F855A",
        },
      },
      HarnessSkill: {
        definition: "Declared skill runnable inside an agent harness scope.",
        id_prefix: "SKL",
        attributes: {
          skill_id: { kind: "string", required: true, pattern: "^[a-z0-9/_-]+$" },
          supported_hosts: {
            kind: "collection",
            minItems: 1,
            maxItems: 12,
            item: { kind: "string", minLength: 2, maxLength: 32 },
          },
        },
      },
    },
    relation_types: {
      targets_runtime: {
        description: "Binds a harness skill to an archi@1 runtime kind.",
        source_types: ["HarnessSkill"],
        target_types: ["archi_v1:runtime"],
        cardinality: {
          out: { min: 1, max: "many" },
          in: { min: 0, max: "many" },
        },
      },
      reports_on: {
        description: "Binds a reporting skill to a version-pinned Track work item.",
        source_types: ["HarnessSkill"],
        target_types: ["track_agile:WorkItem"],
        cardinality: {
          out: { min: 0, max: "many" },
          in: { min: 0, max: "many" },
        },
      },
    },
    file_projections: {
      harness_overlay: {
        kind: "h2a-harness-overlay",
        root_dir: ".h2a",
        relative_path_template: ".h2a/overlays/repo/harness-overlay.json",
        relative_path_templates: {
          repo: ".h2a/overlays/repo/harness-overlay.json",
          workspace: ".h2a/overlays/workspaces/{workspaceId}/{developerPseudoId}.json",
          worktree: ".h2a/overlays/worktrees/{derivedWorktreeId}.json",
        },
        precedence: "tighten-only",
        format: "json",
        include_node_types: ["HarnessRule", "HarnessSkill"],
        order_by: ["entity_id"],
        projected_fields: ["rule_key", "enforcement", "skill_id"],
      },
    },
  };
}

function validMandate(
  rights: readonly string[],
  overrides: Partial<H2AMandateEnvelope> = {},
): H2AMandateEnvelope {
  return {
    mandateId: "mandate-01",
    instance: "sentropic-primary",
    role: "PRINCIPAL",
    scope: "org:sentropic",
    rights,
    expiresAt: "2030-01-01T00:00:00.000Z",
    envelopeDigest: `sha256:${"a".repeat(64)}`,
    signatures: [{ by: "principal-key-1", alg: "Ed25519", value: "c2lnbmF0dXJl" }],
    ...overrides,
  };
}

function buildMinimalTrackTemplate(): MetamodelTemplateDocument {
  return {
    metamodel_version: "engram.metamodel/v1",
    lineage: "track",
    id: "sentropic.minimal-track",
    version: "1.0.0",
    composed_lineage_pins: [],
    node_types: {
      Task: {
        definition: "Minimal trackable task node.",
        attributes: {
          title: { kind: "string", required: true },
        },
        state_machine: {
          states: ["open", "done"],
          initial_state: "open",
          terminal_states: ["done"],
          transitions: [{ from: ["open"], to: ["done"], authority: "author" }],
        },
      },
    },
    relation_types: {
      depends_on: {
        source_types: ["Task"],
        target_types: ["Task"],
        cardinality: {
          out: { min: 0, max: "many" },
          in: { min: 0, max: "many" },
        },
      },
    },
  };
}

it("complete track and h2a v1 templates validate", () => {
  const trackTemplate = deepFreeze(buildCompleteTrackTemplate());
  const trackDigest = semanticProfileDigest(trackTemplate);
  const trackResult = validateTemplateAgainstMetamodel(trackTemplate, {
    auth: {
      writerMandate: validMandate(["engram:register-template:track"]),
      callerProvider: "sentropic.track",
      now: "2026-11-24T12:00:00.000Z",
      verifySignature: () => true,
    },
    expectedDigests: {
      templateDigestSha256: trackDigest,
    },
  });

  expect(trackResult.status).toBe("accepted");
  if (trackResult.status !== "accepted") throw new Error("Expected track template acceptance");
  expect(trackResult.diagnostics).toEqual([]);
  expect(trackResult.warnings).toEqual([]);
  expect(trackResult.templateDigestSha256).toBe(trackDigest);
  expect(trackResult.presentationDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
  expect(trackResult.rawSha256).toBeNull();

  // YAML serialization of the complete track template validates identically.
  const trackYaml = stringifyYaml(trackTemplate);
  const trackYamlResult = validateTemplateAgainstMetamodel(trackYaml);
  expect(trackYamlResult.status).toBe("accepted");
  if (trackYamlResult.status !== "accepted") throw new Error("Expected YAML track template acceptance");
  expect(trackYamlResult.templateDigestSha256).toBe(trackDigest);
  expect(trackYamlResult.rawSha256).toMatch(/^sha256:[0-9a-f]{64}$/);

  const h2aTemplate = deepFreeze(buildCompleteH2aTemplate(trackDigest));
  const h2aResult = validateTemplateAgainstMetamodel(h2aTemplate, {
    auth: {
      writerMandate: validMandate(["engram:register-template:h2a"]),
      callerProvider: "sentropic.h2a",
      now: "2026-11-24T12:00:00.000Z",
      verifySignature: () => true,
    },
    registry: [
      {
        lineage: "archi",
        templateId: "archi",
        templateVersion: "1.0.0",
        templateDigestSha256: ARCHI_V1_SHA256,
        nodeTypeIds: ARCHI_V1_ENTITY_IDS,
      },
      {
        lineage: "track",
        templateId: "sentropic.agile-product",
        templateVersion: "1.0.0",
        templateDigestSha256: trackDigest,
        nodeTypeIds: Object.keys(trackTemplate.node_types),
        document: trackTemplate,
      },
    ],
  });

  expect(h2aResult.status).toBe("accepted");
  if (h2aResult.status !== "accepted") throw new Error("Expected h2a template acceptance");
  expect(h2aResult.diagnostics).toEqual([]);

  // T-M-C neutrality proof: arbitrary open domain strings validate with zero hardcoded Track/h2a lists.
  const openDomainTemplate = deepFreeze({
    metamodel_version: "engram.metamodel/v1" as const,
    lineage: "track" as const,
    id: "custom.open-domain",
    version: "1.0.0",
    node_types: {
      OrbitalArtifact: {
        state_machine: {
          states: ["nascent", "calibrated", "retired"],
          initial_state: "nascent",
          terminal_states: ["retired"],
          transitions: [
            { from: ["nascent"], to: ["calibrated"], authority: "author" as const },
            { from: ["calibrated"], to: ["retired"], authority: "mandated-act" as const },
          ],
        },
      },
    },
    domain_policies: {
      levels: [
        { id: "tier_alpha", rank: 0, modes: ["orbital"] },
        { id: "tier_beta", rank: 1, requires_parent: true },
      ],
      nesting_matrix: [
        { parent_level: "tier_alpha", parent_modes: ["orbital"], allowed_child_levels: ["tier_beta"] },
      ],
      stage_refinements: [
        { parent_stage: "calibrated", sub_stages: ["fine-tuned"] },
      ],
      risk_policy: {
        likelihood_scale: [1, 2, 3],
        impact_scale: [1, 2, 3],
        severity_bands: [
          { id: "minor", min_score: 1, max_score: 3 },
          { id: "major", min_score: 4, max_score: 9 },
        ],
        categories: ["cosmic"],
        responses: ["shield"],
      },
    },
  });
  expect(validateTemplateAgainstMetamodel(openDomainTemplate).status).toBe("accepted");
});

it("each diagnostic code of the grammar has one negative vector, and the input object is never mutated", () => {
  const EXPECTED_CODES: readonly MetamodelDiagnosticCode[] = [
    "MM_SYNTAX_PARSE_ERROR",
    "MM_SYNTAX_NON_PLAIN_OBJECT",
    "MM_SYNTAX_FORBIDDEN_PROTO_KEY",
    "MM_IDENTITY_MISSING_REQUIRED",
    "MM_IDENTITY_UNKNOWN_METAMODEL_VERSION",
    "MM_AUTH_MANDATE_MISSING_OR_INVALID",
    "MM_AUTH_LINEAGE_SOLE_AUTHOR_VIOLATION",
    "MM_VERSION_NOT_EXACT_SEMVER",
    "MM_VERSION_IMMUTABLE_CONFLICT",
    "MM_VERSION_PARENT_PIN_MISSING_OR_MISMATCH",
    "MM_VERSION_REGRESSION",
    "MM_VERSION_MINOR_REQUIRED_FOR_ADDITIVE",
    "MM_VERSION_MAJOR_REQUIRED_FOR_BREAKING",
    "MM_VERSION_UNMAPPED_BREAKING_RENAME",
    "MM_DIGEST_MISMATCH",
    "MM_NODE_EMPTY_SET",
    "MM_NODE_INVALID_IDENTIFIER",
    "MM_NODE_INVALID_REGISTRY_REF",
    "MM_NODE_UNSUPPORTED_LINKING_FN",
    "MM_NODE_INVALID_VISUAL_ENCODING",
    "MM_ATTR_INVALID_DECLARATION",
    "MM_REL_MISSING_ENDPOINTS",
    "MM_REL_UNKNOWN_ENDPOINT_TYPE",
    "MM_REL_INVALID_CARDINALITY",
    "MM_REL_INVALID_HIERARCHY",
    "MM_STATE_INVALID_MACHINE",
    "MM_DOMAIN_POLICY_INVALID",
    "MM_FILE_SHAPE_LINEAGE_FORBIDDEN",
    "MM_FILE_SHAPE_PATH_ESCAPE",
    "MM_FILE_SHAPE_INCOMPLETE_D29_PAIR",
    "MM_COMPOSE_FLOATING_VERSION",
    "MM_COMPOSE_INVALID_DIGEST",
    "MM_COMPOSE_TARGET_NOT_REGISTERED",
    "MM_COMPOSE_DIGEST_MISMATCH",
    "MM_COMPOSE_UNKNOWN_EXTERNAL_TYPE",
    "MM_COMPOSE_EXTERNAL_TYPE_REDEFINITION",
    "MM_COMPOSE_CYCLE_DETECTED",
    "MM_OVERLAY_CROSS_LINEAGE_MUTATION_FORBIDDEN",
    "MM_PRIVACY_DENYLIST_VIOLATION",
    "MM_REGEX_INVALID_UNICODE",
  ];

  expect(METAMODEL_DIAGNOSTIC_CODES).toEqual(EXPECTED_CODES);

  const baseTrack = buildMinimalTrackTemplate();
  const baseTrackDigest = semanticProfileDigest(baseTrack);
  const baseTrackInternalDigest = toInternalDigest(baseTrackDigest);
  const fullTrack = buildCompleteTrackTemplate();
  const fullTrackDigest = semanticProfileDigest(fullTrack);
  const baseH2a = buildCompleteH2aTemplate(fullTrackDigest);

  const protoPayload = Object.defineProperty(
    structuredClone(baseTrack) as unknown as Record<string, unknown>,
    "__proto__",
    { value: { polluted: true }, enumerable: true, configurable: true, writable: true },
  );

  type NegativeVector = {
    readonly input: unknown;
    readonly context?: MetamodelValidationContext;
    readonly freezeObject?: boolean;
    readonly expectedPath?: string;
  };

  const vectors: Record<MetamodelDiagnosticCode, NegativeVector> = {
    MM_SYNTAX_PARSE_ERROR: {
      input: "metamodel_version: [unterminated",
      expectedPath: "template",
    },
    MM_SYNTAX_NON_PLAIN_OBJECT: {
      input: {
        ...structuredClone(baseTrack),
        extra_non_plain: new Date("2026-11-24T00:00:00.000Z"),
      },
      freezeObject: false,
      expectedPath: "extra_non_plain",
    },
    MM_SYNTAX_FORBIDDEN_PROTO_KEY: {
      input: protoPayload,
      freezeObject: true,
      expectedPath: "__proto__",
    },
    MM_IDENTITY_MISSING_REQUIRED: {
      input: {
        ...structuredClone(baseTrack),
        id: "   ",
      },
      freezeObject: true,
      expectedPath: "id",
    },
    MM_IDENTITY_UNKNOWN_METAMODEL_VERSION: {
      input: {
        ...structuredClone(baseTrack),
        metamodel_version: "engram.metamodel/v99",
      },
      freezeObject: true,
      expectedPath: "metamodel_version",
    },
    MM_AUTH_MANDATE_MISSING_OR_INVALID: {
      input: structuredClone(baseTrack),
      context: {
        auth: {
          writerMandate: validMandate(["session:write"]),
          callerProvider: "sentropic.track",
          now: "2026-11-24T12:00:00.000Z",
          verifySignature: () => true,
        },
      },
      freezeObject: true,
      expectedPath: "auth.writerMandate.rights",
    },
    MM_AUTH_LINEAGE_SOLE_AUTHOR_VIOLATION: {
      input: structuredClone(baseTrack),
      context: {
        auth: {
          writerMandate: validMandate(["engram:register-template:h2a"]),
          callerProvider: "sentropic.track",
          now: "2026-11-24T12:00:00.000Z",
          verifySignature: () => true,
        },
      },
      freezeObject: true,
      expectedPath: "auth.writerMandate.rights",
    },
    MM_VERSION_NOT_EXACT_SEMVER: {
      input: {
        ...structuredClone(baseTrack),
        version: "^1.0.0",
      },
      freezeObject: true,
      expectedPath: "version",
    },
    MM_VERSION_IMMUTABLE_CONFLICT: {
      input: {
        ...structuredClone(baseTrack),
        node_types: {
          ...structuredClone(baseTrack.node_types),
          ExtraNode: { definition: "Changes digest at same version." },
        },
      },
      context: {
        registry: [
          {
            lineage: "track",
            templateId: baseTrack.id,
            templateVersion: "1.0.0",
            templateDigestSha256: baseTrackDigest,
            document: baseTrack,
          },
        ],
      },
      freezeObject: true,
      expectedPath: "version",
    },
    MM_VERSION_PARENT_PIN_MISSING_OR_MISMATCH: {
      input: {
        ...structuredClone(baseTrack),
        version: "1.1.0",
      },
      context: {
        registry: [
          {
            lineage: "track",
            templateId: baseTrack.id,
            templateVersion: "1.0.0",
            templateDigestSha256: baseTrackDigest,
            document: baseTrack,
          },
        ],
      },
      freezeObject: true,
      expectedPath: "parent_pin",
    },
    MM_VERSION_REGRESSION: {
      input: {
        ...structuredClone(baseTrack),
        version: "0.9.0",
        parent_pin: {
          id: baseTrack.id,
          version: "1.0.0",
          contentDigest: baseTrackInternalDigest,
        },
      },
      context: {
        registry: [
          {
            lineage: "track",
            templateId: baseTrack.id,
            templateVersion: "1.0.0",
            templateDigestSha256: baseTrackDigest,
            document: baseTrack,
          },
        ],
      },
      freezeObject: true,
      expectedPath: "version",
    },
    MM_VERSION_MINOR_REQUIRED_FOR_ADDITIVE: {
      input: {
        ...structuredClone(baseTrack),
        version: "1.0.1",
        parent_pin: {
          id: baseTrack.id,
          version: "1.0.0",
          contentDigest: baseTrackInternalDigest,
        },
        node_types: {
          ...structuredClone(baseTrack.node_types),
          Milestone: { definition: "Additive node type bumped as PATCH." },
        },
      },
      context: {
        registry: [
          {
            lineage: "track",
            templateId: baseTrack.id,
            templateVersion: "1.0.0",
            templateDigestSha256: baseTrackDigest,
            document: baseTrack,
          },
        ],
      },
      freezeObject: true,
      expectedPath: "version",
    },
    MM_VERSION_MAJOR_REQUIRED_FOR_BREAKING: {
      input: {
        ...structuredClone(baseTrack),
        version: "1.1.0",
        parent_pin: {
          id: baseTrack.id,
          version: "1.0.0",
          contentDigest: baseTrackInternalDigest,
        },
        relation_types: {
          depends_on: {
            source_types: ["Task"],
            target_types: ["Task"],
            cardinality: {
              out: { min: 1, max: 1 },
              in: { min: 0, max: "many" },
            },
          },
        },
      },
      context: {
        registry: [
          {
            lineage: "track",
            templateId: baseTrack.id,
            templateVersion: "1.0.0",
            templateDigestSha256: baseTrackDigest,
            document: baseTrack,
          },
        ],
      },
      freezeObject: true,
      expectedPath: "version",
    },
    MM_VERSION_UNMAPPED_BREAKING_RENAME: {
      input: {
        ...structuredClone(baseTrack),
        version: "2.0.0",
        parent_pin: {
          id: baseTrack.id,
          version: "1.0.0",
          contentDigest: baseTrackInternalDigest,
        },
        node_types: {
          ActionItem: {
            ...structuredClone(baseTrack.node_types.Task!),
            aliases: ["Task"],
          },
        },
        relation_types: {
          depends_on: {
            source_types: ["ActionItem"],
            target_types: ["ActionItem"],
          },
        },
      },
      context: {
        registry: [
          {
            lineage: "track",
            templateId: baseTrack.id,
            templateVersion: "1.0.0",
            templateDigestSha256: baseTrackDigest,
            document: baseTrack,
          },
        ],
      },
      freezeObject: true,
      expectedPath: "mapping_pin",
    },
    MM_DIGEST_MISMATCH: {
      input: structuredClone(baseTrack),
      context: {
        expectedDigests: {
          templateDigestSha256: `sha256:${"0".repeat(64)}`,
        },
      },
      freezeObject: true,
      expectedPath: "templateDigestSha256",
    },
    MM_NODE_EMPTY_SET: {
      input: {
        ...structuredClone(baseTrack),
        node_types: {},
        relation_types: {},
      },
      freezeObject: true,
      expectedPath: "node_types",
    },
    MM_NODE_INVALID_IDENTIFIER: {
      input: {
        ...structuredClone(baseTrack),
        node_types: {
          "123Invalid": { definition: "Starts with a digit." },
        },
        relation_types: {},
      },
      freezeObject: true,
      expectedPath: "node_types.123Invalid",
    },
    MM_NODE_INVALID_REGISTRY_REF: {
      input: {
        ...structuredClone(baseTrack),
        node_types: {
          Task: {
            ...structuredClone(baseTrack.node_types.Task!),
            registry: "missing_registry",
          },
        },
      },
      freezeObject: true,
      expectedPath: "node_types.Task.registry",
    },
    MM_NODE_UNSUPPORTED_LINKING_FN: {
      input: {
        ...structuredClone(baseTrack),
        node_types: {
          Task: {
            ...structuredClone(baseTrack.node_types.Task!),
            linking: {
              normalize: { fn: "./local-normalizer.mjs#normalize" },
            },
          },
        },
      },
      freezeObject: true,
      expectedPath: "node_types.Task.linking.normalize.fn",
    },
    MM_NODE_INVALID_VISUAL_ENCODING: {
      input: {
        ...structuredClone(baseTrack),
        node_types: {
          Task: {
            ...structuredClone(baseTrack.node_types.Task!),
            visual_encoding: {
              shape: "octagon" as unknown as "box",
            },
          },
        },
      },
      freezeObject: true,
      expectedPath: "node_types.Task.visual_encoding.shape",
    },
    MM_ATTR_INVALID_DECLARATION: {
      input: {
        ...structuredClone(baseTrack),
        node_types: {
          Task: {
            ...structuredClone(baseTrack.node_types.Task!),
            attributes: {
              bad_enum: { kind: "enum", values: [] },
            },
          },
        },
      },
      freezeObject: true,
      expectedPath: "node_types.Task.attributes.bad_enum.values",
    },
    MM_REL_MISSING_ENDPOINTS: {
      input: {
        ...structuredClone(baseTrack),
        relation_types: {
          depends_on: {
            source_types: [],
            target_types: ["Task"],
          },
        },
      },
      freezeObject: true,
      expectedPath: "relation_types.depends_on.source_types",
    },
    MM_REL_UNKNOWN_ENDPOINT_TYPE: {
      input: {
        ...structuredClone(baseTrack),
        relation_types: {
          depends_on: {
            source_types: ["Task"],
            target_types: ["GhostNodeType"],
          },
        },
      },
      freezeObject: true,
      expectedPath: "relation_types.depends_on.target_types[0]",
    },
    MM_REL_INVALID_CARDINALITY: {
      input: {
        ...structuredClone(baseTrack),
        relation_types: {
          depends_on: {
            source_types: ["Task"],
            target_types: ["Task"],
            cardinality: { out: { min: 3, max: 1 } },
          },
        },
      },
      freezeObject: true,
      expectedPath: "relation_types.depends_on.cardinality.out",
    },
    MM_REL_INVALID_HIERARCHY: {
      input: {
        ...structuredClone(baseTrack),
        relation_types: {
          depends_on: {
            source_types: ["Task"],
            target_types: ["Task"],
            hierarchy: {
              id: "bad-h",
              shape: "tree",
              parent_role: "source",
              child_role: "source",
            },
          },
        },
      },
      freezeObject: true,
      expectedPath: "relation_types.depends_on.hierarchy",
    },
    MM_STATE_INVALID_MACHINE: {
      input: {
        ...structuredClone(baseTrack),
        node_types: {
          Task: {
            ...structuredClone(baseTrack.node_types.Task!),
            state_machine: {
              states: ["open", "done", "unreachable_terminal"],
              initial_state: "open",
              terminal_states: ["unreachable_terminal"],
              transitions: [{ from: ["open"], to: ["done"], authority: "author" }],
            },
          },
        },
      },
      freezeObject: true,
      expectedPath: "node_types.Task.state_machine.terminal_states",
    },
    MM_DOMAIN_POLICY_INVALID: {
      input: {
        ...structuredClone(fullTrack),
        domain_policies: {
          ...structuredClone(fullTrack.domain_policies!),
          risk_policy: {
            ...structuredClone(fullTrack.domain_policies!.risk_policy!),
            severity_bands: [
              { id: "low", min_score: 1, max_score: 4 },
              { id: "gap", min_score: 6, max_score: 25 },
            ],
            max_review_validity_days_by_band: {
              low: 90,
              gap: 7,
            },
          },
        },
      },
      freezeObject: true,
      expectedPath: "domain_policies.risk_policy.severity_bands",
    },
    MM_FILE_SHAPE_LINEAGE_FORBIDDEN: {
      input: {
        ...structuredClone(baseTrack),
        file_projections: {
          wrong_lineage_overlay: structuredClone(baseH2a.file_projections!.harness_overlay!),
        },
      },
      freezeObject: true,
      expectedPath: "file_projections.wrong_lineage_overlay.kind",
    },
    MM_FILE_SHAPE_PATH_ESCAPE: {
      input: {
        ...structuredClone(fullTrack),
        file_projections: {
          escaped_slice: {
            ...structuredClone(fullTrack.file_projections!.default_pr_slice!),
            event_journal: {
              ...(structuredClone(fullTrack.file_projections!.default_pr_slice!) as {
                event_journal: Record<string, unknown>;
              }).event_journal,
              relative_path_template: ".track/../outside/events.jsonl",
            },
          },
        },
      },
      freezeObject: true,
      expectedPath: "file_projections.escaped_slice.event_journal.relative_path_template",
    },
    MM_FILE_SHAPE_INCOMPLETE_D29_PAIR: {
      input: {
        ...structuredClone(fullTrack),
        file_projections: {
          incomplete_slice: {
            ...structuredClone(fullTrack.file_projections!.default_pr_slice!),
            content_mode: "journal-only",
          },
        },
      },
      freezeObject: true,
      expectedPath: "file_projections.incomplete_slice.content_mode",
    },
    MM_COMPOSE_FLOATING_VERSION: {
      input: {
        ...structuredClone(baseTrack),
        composed_lineage_pins: [
          {
            importAlias: "archi_v1",
            lineage: "archi",
            templateId: "archi",
            templateVersion: "^1.0.0",
            templateDigestSha256: ARCHI_V1_SHA256,
          },
        ],
      },
      freezeObject: true,
      expectedPath: "composed_lineage_pins[0].templateVersion",
    },
    MM_COMPOSE_INVALID_DIGEST: {
      input: {
        ...structuredClone(baseTrack),
        composed_lineage_pins: [
          {
            importAlias: "archi_v1",
            lineage: "archi",
            templateId: "archi",
            templateVersion: "1.0.0",
            templateDigestSha256: "not-a-sha256" as Sha256Digest,
          },
        ],
      },
      freezeObject: true,
      expectedPath: "composed_lineage_pins[0].templateDigestSha256",
    },
    MM_COMPOSE_TARGET_NOT_REGISTERED: {
      input: structuredClone(baseH2a),
      context: {
        registry: [
          {
            lineage: "archi",
            templateId: "archi",
            templateVersion: "1.0.0",
            templateDigestSha256: ARCHI_V1_SHA256,
            nodeTypeIds: ARCHI_V1_ENTITY_IDS,
          },
        ],
      },
      freezeObject: true,
      expectedPath: "composed_lineage_pins[1]",
    },
    MM_COMPOSE_DIGEST_MISMATCH: {
      input: structuredClone(baseH2a),
      context: {
        registry: [
          {
            lineage: "archi",
            templateId: "archi",
            templateVersion: "1.0.0",
            templateDigestSha256: `sha256:${"f".repeat(64)}`,
            nodeTypeIds: ARCHI_V1_ENTITY_IDS,
          },
          {
            lineage: "track",
            templateId: "sentropic.agile-product",
            templateVersion: "1.0.0",
            templateDigestSha256: fullTrackDigest,
            nodeTypeIds: Object.keys(fullTrack.node_types),
          },
        ],
      },
      freezeObject: true,
      expectedPath: "composed_lineage_pins[0].templateDigestSha256",
    },
    MM_COMPOSE_UNKNOWN_EXTERNAL_TYPE: {
      input: {
        ...structuredClone(baseH2a),
        relation_types: {
          ...structuredClone(baseH2a.relation_types!),
          bad_external_ref: {
            source_types: ["HarnessSkill"],
            target_types: ["archi_v1:nonexistent_kind"],
          },
        },
      },
      context: {
        registry: [
          {
            lineage: "archi",
            templateId: "archi",
            templateVersion: "1.0.0",
            templateDigestSha256: ARCHI_V1_SHA256,
            nodeTypeIds: ARCHI_V1_ENTITY_IDS,
          },
          {
            lineage: "track",
            templateId: "sentropic.agile-product",
            templateVersion: "1.0.0",
            templateDigestSha256: fullTrackDigest,
            nodeTypeIds: Object.keys(fullTrack.node_types),
          },
        ],
      },
      freezeObject: true,
      expectedPath: "relation_types.bad_external_ref.target_types[0]",
    },
    MM_COMPOSE_EXTERNAL_TYPE_REDEFINITION: {
      input: {
        ...structuredClone(baseH2a),
        node_types: {
          ...structuredClone(baseH2a.node_types),
          "track_agile:WorkItem": {
            definition: "Illegal redefinition of external Track node type.",
          },
        },
      },
      freezeObject: true,
      expectedPath: "node_types.track_agile:WorkItem",
    },
    MM_COMPOSE_CYCLE_DETECTED: {
      input: {
        ...structuredClone(baseH2a),
        composed_lineage_pins: [
          {
            importAlias: "cycle_peer",
            lineage: "engram",
            templateId: "sentropic.bridge-cycle",
            templateVersion: "1.0.0",
            templateDigestSha256: `sha256:${"b".repeat(64)}`,
          },
        ],
        node_types: {
          HarnessSkill: structuredClone(baseH2a.node_types.HarnessSkill!),
        },
        relation_types: {},
        file_projections: undefined,
      },
      context: {
        registry: [
          {
            lineage: "engram",
            templateId: "sentropic.bridge-cycle",
            templateVersion: "1.0.0",
            templateDigestSha256: `sha256:${"b".repeat(64)}`,
            nodeTypeIds: ["BridgeNode"],
            composedLineagePins: [
              {
                importAlias: "back_to_h2a",
                lineage: "h2a",
                templateId: baseH2a.id,
                templateVersion: baseH2a.version,
                templateDigestSha256: `sha256:${"c".repeat(64)}`,
              },
            ],
          },
        ],
      },
      freezeObject: true,
      expectedPath: "composed_lineage_pins[0]",
    },
    MM_OVERLAY_CROSS_LINEAGE_MUTATION_FORBIDDEN: {
      input: {
        ...structuredClone(baseH2a),
        file_projections: {
          illegal_track_overlay: {
            kind: "h2a-harness-overlay",
            root_dir: ".h2a",
            relative_path_template: ".track/events.jsonl",
            precedence: "tighten-only",
            format: "json",
            include_node_types: ["HarnessRule"],
            order_by: ["entity_id"],
            projected_fields: ["rule_key"],
          },
        },
      },
      context: {
        registry: [
          {
            lineage: "archi",
            templateId: "archi",
            templateVersion: "1.0.0",
            templateDigestSha256: ARCHI_V1_SHA256,
            nodeTypeIds: ARCHI_V1_ENTITY_IDS,
          },
          {
            lineage: "track",
            templateId: "sentropic.agile-product",
            templateVersion: "1.0.0",
            templateDigestSha256: fullTrackDigest,
            nodeTypeIds: Object.keys(fullTrack.node_types),
          },
        ],
      },
      freezeObject: true,
      expectedPath: "file_projections.illegal_track_overlay.relative_path_template",
    },
    MM_PRIVACY_DENYLIST_VIOLATION: {
      input: {
        ...structuredClone(baseTrack),
        node_types: {
          Task: {
            ...structuredClone(baseTrack.node_types.Task!),
            definition: "Contact confidential owner alice.secret@client-corp.example for CLIENT_OMEGA_42.",
          },
        },
      },
      freezeObject: true,
      expectedPath: "node_types.Task.definition",
    },
    MM_REGEX_INVALID_UNICODE: {
      input: {
        ...structuredClone(baseTrack),
        node_types: {
          Task: {
            ...structuredClone(baseTrack.node_types.Task!),
            attributes: {
              title: { kind: "string", pattern: "^(\\u{1,})+$" },
            },
          },
        },
      },
      freezeObject: true,
      expectedPath: "node_types.Task.attributes.title.pattern",
    },
  };

  for (const code of METAMODEL_DIAGNOSTIC_CODES) {
    const vector = vectors[code];
    expect(vector, `Missing negative vector for ${code}`).toBeDefined();

    let snapshotBefore: string | null = null;
    if (vector.freezeObject && typeof vector.input === "object" && vector.input !== null) {
      snapshotBefore = JSON.stringify(vector.input);
      deepFreeze(vector.input);
    }

    const result = validateTemplateAgainstMetamodel(vector.input, vector.context);
    expect(result.status, `Expected refusal for ${code}`).toBe("refused-metamodel-invalid");
    if (result.status !== "refused-metamodel-invalid") continue;

    expect(
      result.diagnostics.map((diag) => diag.code),
      `Expected strictly one diagnostic [${code}]; got: ${JSON.stringify(result.diagnostics)}`,
    ).toEqual([code]);

    const diag = result.diagnostics[0]!;
    expect(diag.severity).toBe("error");
    if (vector.expectedPath !== undefined) {
      expect(diag.path).toBe(vector.expectedPath);
    } else {
      expect(diag.path.length, `${code} path must be non-empty`).toBeGreaterThan(0);
    }
    expect(diag.subject.length, `${code} subject must be non-empty`).toBeGreaterThan(0);
    expect(diag.message.length, `${code} message must be non-empty`).toBeGreaterThan(0);

    if (snapshotBefore !== null) {
      expect(JSON.stringify(vector.input), `Input was mutated on ${code}`).toBe(snapshotBefore);
    }
  }
});

it("instance validation enforces state transitions and endpoint cardinality", () => {
  const rawProfile: OntologyProfile = {
    metamodel_version: "engram.metamodel/v1",
    id: "synthetic-metamodel-instance",
    version: "1.0.0",
    citation_policy: {
      minimum_granularity: "file",
      require_source_file: false,
    },
    node_types: {
      Feature: {
        state_machines: {
          specification: {
            states: ["draft", "specified", "withdrawn"],
            initial_state: "draft",
            terminal_states: ["withdrawn"],
            transitions: [
              { from: ["draft"], to: ["specified"], authority: "author" },
              { from: ["draft", "specified"], to: ["withdrawn"], authority: "mandated-act" },
            ],
          },
          realization: {
            states: ["to-do", "in-progress", "verified", "accepted"],
            initial_state: "to-do",
            terminal_states: ["accepted"],
            transitions: [
              { from: ["to-do"], to: ["in-progress"], authority: "author" },
              { from: ["in-progress"], to: ["verified"], authority: "third-party-reviewer" },
              { from: ["verified"], to: ["accepted"], authority: "own-act-human" },
            ],
          },
        },
      } as unknown as OntologyProfile["node_types"][string],
      Task: {
        state_machine: {
          states: ["open", "in-progress", "done"],
          initial_state: "open",
          terminal_states: ["done"],
          transitions: [
            { from: ["open"], to: ["in-progress"], authority: "author" },
            { from: ["in-progress"], to: ["done"], authority: "author" },
          ],
        },
      } as unknown as OntologyProfile["node_types"][string],
    },
    relation_types: {
      belongs_to: {
        source_types: ["Task"],
        target_types: ["Feature"],
        cardinality: {
          out: { min: 1, max: 1 },
          in: { min: 1, max: 2 },
        },
      },
      relates_to: {
        source_types: ["Task"],
        target_types: ["Task"],
        cardinality: {
          out: { min: 0, max: "many" },
          in: { min: 0, max: "many" },
        },
      },
    },
  };

  const normalized = normalizeOntologyProfile(rawProfile);

  // 1. Valid multi-axis & single-machine transitions + valid endpoint cardinality.
  const validExtraction: Extraction = {
    nodes: [
      {
        id: "feat-1",
        label: "Feature 1",
        file_type: "document",
        source_file: "spec.md",
        node_type: "Feature",
        previous_states: { specification: "draft", realization: "to-do" },
        states: { specification: "specified", realization: "in-progress" },
      },
      {
        id: "task-1",
        label: "Task 1",
        file_type: "document",
        source_file: "spec.md",
        node_type: "Task",
        previous_status: "open",
        status: "in-progress",
      },
      {
        id: "task-2",
        label: "Task 2",
        file_type: "document",
        source_file: "spec.md",
        node_type: "Task",
        previous_status: "in-progress",
        status: "done",
      },
    ],
    edges: [
      {
        source: "task-1",
        target: "feat-1",
        relation: "belongs_to",
        confidence: "EXTRACTED",
        source_file: "spec.md",
      },
      {
        source: "task-2",
        target: "feat-1",
        relation: "belongs_to",
        confidence: "EXTRACTED",
        source_file: "spec.md",
      },
      {
        source: "task-1",
        target: "task-2",
        relation: "relates_to",
        confidence: "EXTRACTED",
        source_file: "spec.md",
      },
    ],
    input_tokens: 0,
    output_tokens: 0,
  };

  const okResult = validateProfileExtraction(validExtraction, { profile: normalized });
  expect(okResult.valid).toBe(true);
  expect(okResult.issues).toEqual([]);

  // 2. Invalid single-machine transition (skip open -> done) & invalid multi-axis transition (to-do -> accepted) + unknown status.
  const badStateExtraction: Extraction = {
    nodes: [
      {
        id: "feat-bad",
        label: "Feature Bad",
        file_type: "document",
        source_file: "spec.md",
        node_type: "Feature",
        previous_states: { specification: "draft", realization: "to-do" },
        states: { specification: "bogus-state", realization: "accepted" },
      },
      {
        id: "task-bad",
        label: "Task Bad",
        file_type: "document",
        source_file: "spec.md",
        node_type: "Task",
        previous_status: "open",
        status: "done",
      },
    ],
    edges: [
      {
        source: "task-bad",
        target: "feat-bad",
        relation: "belongs_to",
        confidence: "EXTRACTED",
        source_file: "spec.md",
      },
    ],
    input_tokens: 0,
    output_tokens: 0,
  };

  const badStateResult = validateProfileExtraction(badStateExtraction, { profile: normalized });
  expect(badStateResult.valid).toBe(false);
  expect(badStateResult.issues).toContainEqual(
    expect.objectContaining({
      severity: "error",
      code: "unknown_status",
      nodeId: "feat-bad",
      path: "nodes[0].states.specification",
    }),
  );
  expect(badStateResult.issues).toContainEqual(
    expect.objectContaining({
      severity: "error",
      code: "invalid_status_transition",
      nodeId: "feat-bad",
      path: "nodes[0].states.realization",
    }),
  );
  expect(badStateResult.issues).toContainEqual(
    expect.objectContaining({
      severity: "error",
      code: "invalid_status_transition",
      nodeId: "task-bad",
    }),
  );

  // Unknown axis in multi-axis states is rejected explicitly.
  const unknownAxisResult = validateProfileExtraction(
    {
      ...validExtraction,
      nodes: [
        {
          ...validExtraction.nodes[0]!,
          states: { specification: "specified", realization: "in-progress", phantom_axis: "active" },
        },
        ...validExtraction.nodes.slice(1),
      ],
    },
    { profile: normalized },
  );
  expect(unknownAxisResult.valid).toBe(false);
  expect(unknownAxisResult.issues).toContainEqual(
    expect.objectContaining({
      severity: "error",
      code: "unknown_state_axis",
      nodeId: "feat-1",
      path: "nodes[0].states.phantom_axis",
    }),
  );

  // 3. Relation endpoint cardinality violations:
  //    - feat-empty violates in.min = 1 (0 incoming)
  //    - feat-overloaded violates in.max = 2 (3 incoming)
  //    - task-orphan violates out.min = 1 (0 outgoing)
  //    - task-double violates out.max = 1 (2 outgoing)
  const badCardinalityExtraction: Extraction = {
    nodes: [
      {
        id: "feat-empty",
        label: "Empty Feature",
        file_type: "document",
        source_file: "spec.md",
        node_type: "Feature",
        states: { specification: "draft", realization: "to-do" },
      },
      {
        id: "feat-overloaded",
        label: "Overloaded Feature",
        file_type: "document",
        source_file: "spec.md",
        node_type: "Feature",
        states: { specification: "draft", realization: "to-do" },
      },
      {
        id: "task-orphan",
        label: "Orphan Task",
        file_type: "document",
        source_file: "spec.md",
        node_type: "Task",
        status: "open",
      },
      {
        id: "task-double",
        label: "Double Parent Task",
        file_type: "document",
        source_file: "spec.md",
        node_type: "Task",
        status: "open",
      },
      {
        id: "task-a",
        label: "Task A",
        file_type: "document",
        source_file: "spec.md",
        node_type: "Task",
        status: "open",
      },
    ],
    edges: [
      {
        source: "task-double",
        target: "feat-overloaded",
        relation: "belongs_to",
        confidence: "EXTRACTED",
        source_file: "spec.md",
      },
      {
        source: "task-double",
        target: "feat-overloaded",
        relation: "belongs_to",
        confidence: "EXTRACTED",
        source_file: "spec.md",
      },
      {
        source: "task-a",
        target: "feat-overloaded",
        relation: "belongs_to",
        confidence: "EXTRACTED",
        source_file: "spec.md",
      },
    ],
    input_tokens: 0,
    output_tokens: 0,
  };

  const badCardResult = validateProfileExtraction(badCardinalityExtraction, { profile: normalized });
  expect(badCardResult.valid).toBe(false);
  expect(badCardResult.issues).toContainEqual(
    expect.objectContaining({
      severity: "error",
      code: "relation_cardinality_violation",
      nodeId: "feat-empty",
    }),
  );
  expect(badCardResult.issues).toContainEqual(
    expect.objectContaining({
      severity: "error",
      code: "relation_cardinality_violation",
      nodeId: "feat-overloaded",
    }),
  );
  expect(badCardResult.issues).toContainEqual(
    expect.objectContaining({
      severity: "error",
      code: "relation_cardinality_violation",
      nodeId: "task-orphan",
    }),
  );
  expect(badCardResult.issues).toContainEqual(
    expect.objectContaining({
      severity: "error",
      code: "relation_cardinality_violation",
      nodeId: "task-double",
    }),
  );
});

describe("metamodel contract non-duplication guard", () => {
  it("src/metamodel/types.ts imports Row 2 contracts without redeclaring them", () => {
    const typesSource = readFileSync(new URL("../src/metamodel/types.ts", import.meta.url), "utf8");
    const sf = ts.createSourceFile("types.ts", typesSource, ts.ScriptTarget.Latest, true);
    const row2Names = new Set([
      "Sha256Digest",
      "MetamodelVersion",
      "LineageId",
      "OntologyTemplateEnvelopeRef",
      "CrossLineageCompositionPin",
      "H2AMandateEnvelope",
    ]);

    const importedFromRow2 = new Set<string>();
    const locallyDeclared: string[] = [];

    for (const stmt of sf.statements) {
      if (ts.isImportDeclaration(stmt) && ts.isStringLiteral(stmt.moduleSpecifier)) {
        if (stmt.moduleSpecifier.text === "../metamodel-contracts.js") {
          const bindings = stmt.importClause?.namedBindings;
          if (bindings && ts.isNamedImports(bindings)) {
            for (const el of bindings.elements) {
              importedFromRow2.add((el.propertyName ?? el.name).text);
            }
          }
        }
      } else if (ts.isTypeAliasDeclaration(stmt) || ts.isInterfaceDeclaration(stmt)) {
        if (row2Names.has(stmt.name.text)) {
          locallyDeclared.push(stmt.name.text);
        }
      }
    }

    expect(locallyDeclared).toEqual([]);
    for (const name of row2Names) {
      expect(importedFromRow2.has(name), `Expected import of ${name} from ../metamodel-contracts.js`).toBe(true);
    }
  });

  it("refuses locked archi@1.0.0 modification, raw YAML __proto__, and accepts presentation-only PATCH bump", () => {
    const lockedArchi = deepFreeze({
      metamodel_version: "engram.metamodel/v1" as const,
      lineage: "archi" as const,
      id: "archi",
      version: "1.0.0",
      node_types: { System: { definition: "Attempted rewrite of archi@1" } },
    });
    const archiResult = validateTemplateAgainstMetamodel(lockedArchi, {
      auth: { callerProvider: "engram" },
    });
    expect(archiResult.status).toBe("refused-metamodel-invalid");
    if (archiResult.status === "refused-metamodel-invalid") {
      expect(archiResult.diagnostics.some((d) => d.code === "MM_AUTH_LINEAGE_SOLE_AUTHOR_VIOLATION")).toBe(true);
    }

    const yamlProto = [
      "metamodel_version: engram.metamodel/v1",
      "lineage: track",
      "id: sentropic.proto-test",
      "version: 1.0.0",
      "__proto__:",
      "  polluted: true",
      "node_types:",
      "  Task: {}",
    ].join("\n");
    const protoYamlRes = validateTemplateAgainstMetamodel(yamlProto);
    expect(protoYamlRes.status).toBe("refused-metamodel-invalid");
    if (protoYamlRes.status === "refused-metamodel-invalid") {
      expect(protoYamlRes.diagnostics.some((d) => d.code === "MM_SYNTAX_FORBIDDEN_PROTO_KEY")).toBe(true);
    }

    const v1 = buildMinimalTrackTemplate();
    const v1Digest = semanticProfileDigest(v1);
    const v1Patch = deepFreeze({
      ...structuredClone(v1),
      version: "1.0.1",
      parent_pin: {
        id: v1.id,
        version: "1.0.0",
        contentDigest: toInternalDigest(v1Digest),
      },
      node_types: {
        Task: {
          ...structuredClone(v1.node_types.Task!),
          visual_encoding: { shape: "star" as const, color_hex: "#FFAA00" },
        },
      },
    });
    const patchResult = validateTemplateAgainstMetamodel(v1Patch, {
      registry: [
        {
          lineage: "track",
          templateId: v1.id,
          templateVersion: "1.0.0",
          templateDigestSha256: v1Digest,
          document: v1,
        },
      ],
    });
    expect(patchResult.status).toBe("accepted");
  });
});

function expectSingleDiagnostic(
  input: unknown,
  expectedCode: MetamodelDiagnosticCode,
  expectedPath: string,
  context?: MetamodelValidationContext,
): void {
  const result = validateTemplateAgainstMetamodel(input, context);
  expect(result.status, `Expected refusal ${expectedCode} at ${expectedPath}`).toBe("refused-metamodel-invalid");
  if (result.status !== "refused-metamodel-invalid") return;
  expect(
    result.diagnostics.map((d) => ({ code: d.code, path: d.path })),
    `Unexpected diagnostics: ${JSON.stringify(result.diagnostics)}`,
  ).toEqual([{ code: expectedCode, path: expectedPath }]);
}

describe("round-2 security, grammar, and single-defect regression suite", () => {
  it("MAJOR-01: refuses percent-encoded traversal, whitespace/control chars, bad placeholders, and cross-lineage overlay paths", () => {
    const fullTrack = buildCompleteTrackTemplate();
    const fullTrackDigest = semanticProfileDigest(fullTrack);
    const baseH2a = buildCompleteH2aTemplate(fullTrackDigest);

    const trackEscapePaths = [
      ".track/%2e%2e/outside/events.jsonl",
      ".track/%2E%2E/outside/events.jsonl",
      ".track/sub%2f..%2foutside.jsonl",
      ".track/sub%5coutside.jsonl",
      ".track/events.jsonl\n",
      ".track/events.jsonl ",
      ".track/events.jsonl/",
      ".track/{../outside}/events.jsonl",
      ".track/{foo/bar}/events.jsonl",
    ];
    for (const badPath of trackEscapePaths) {
      const candidate = structuredClone(fullTrack);
      (candidate.file_projections!.default_pr_slice as { event_journal: { relative_path_template: string } })
        .event_journal.relative_path_template = badPath;
      expectSingleDiagnostic(
        deepFreeze(candidate),
        "MM_FILE_SHAPE_PATH_ESCAPE",
        "file_projections.default_pr_slice.event_journal.relative_path_template",
      );
    }

    const h2aEscape = structuredClone(baseH2a);
    (h2aEscape.file_projections!.harness_overlay as { relative_path_template: string }).relative_path_template =
      ".h2a/%2e%2e/outside.json";
    expectSingleDiagnostic(
      deepFreeze(h2aEscape),
      "MM_FILE_SHAPE_PATH_ESCAPE",
      "file_projections.harness_overlay.relative_path_template",
    );

    const h2aEncodedCrossMutation = structuredClone(baseH2a);
    (h2aEncodedCrossMutation.file_projections!.harness_overlay as { relative_path_template: string }).relative_path_template =
      ".h2a/%2e%2e/.track/events.jsonl";
    expectSingleDiagnostic(
      deepFreeze(h2aEncodedCrossMutation),
      "MM_OVERLAY_CROSS_LINEAGE_MUTATION_FORBIDDEN",
      "file_projections.harness_overlay.relative_path_template",
    );

    const crossTargetPaths = [
      ".h2a/../.track/events.jsonl",
      ".track/../.h2a/overlay.json",
      "././.track/events.jsonl",
      ".track\\events.jsonl",
      "/repo/.track/events.jsonl",
      "sub/../track.ontology.yaml",
      "%2e%2e/.track/events.jsonl",
      ".h2a/%252e%252e/.track/events.jsonl",
      ".track%00/events.jsonl",
    ];
    for (const targetPath of crossTargetPaths) {
      expectSingleDiagnostic(
        deepFreeze(structuredClone(baseH2a)),
        "MM_OVERLAY_CROSS_LINEAGE_MUTATION_FORBIDDEN",
        "overlayCheck.targetPaths",
        { overlayCheck: { targetPaths: [targetPath] } },
      );
    }

    expectSingleDiagnostic(
      deepFreeze(structuredClone(baseH2a)),
      "MM_OVERLAY_CROSS_LINEAGE_MUTATION_FORBIDDEN",
      "overlayCheck.relaxesCeilings",
      { overlayCheck: { relaxesCeilings: true } },
    );

    expectSingleDiagnostic(
      deepFreeze(structuredClone(baseH2a)),
      "MM_OVERLAY_CROSS_LINEAGE_MUTATION_FORBIDDEN",
      "overlayCheck.mutatesLineages",
      { overlayCheck: { mutatesLineages: ["track"] } },
    );
  });

  it("MAJOR-02 & MINOR-07: screens pattern and nested keys against D7 denylist and only exempts valid declared digest paths", () => {
    const baseTrack = buildMinimalTrackTemplate();

    const piiInAttrPattern = structuredClone(baseTrack);
    piiInAttrPattern.node_types.Task = {
      ...piiInAttrPattern.node_types.Task!,
      attributes: {
        title: { kind: "string", pattern: "alice.secret@client-corp.example" },
      },
    };
    expectSingleDiagnostic(
      deepFreeze(piiInAttrPattern),
      "MM_PRIVACY_DENYLIST_VIOLATION",
      "node_types.Task.attributes.title.pattern",
    );

    const piiInPresentationPattern = {
      ...structuredClone(baseTrack),
      presentation: {
        pattern: ["CLIENT_OMEGA_42"],
      },
    };
    expectSingleDiagnostic(
      deepFreeze(piiInPresentationPattern),
      "MM_PRIVACY_DENYLIST_VIOLATION",
      "presentation.pattern[0]",
    );

    const piiInPresentationProfileHash = {
      ...structuredClone(baseTrack),
      presentation: {
        profile_hash: "alice.secret@client-corp.example",
      },
    };
    expectSingleDiagnostic(
      deepFreeze(piiInPresentationProfileHash),
      "MM_PRIVACY_DENYLIST_VIOLATION",
      "presentation.profile_hash",
    );

    // Non-digest string at presentation_hash is NOT exempt from D7 screening.
    const piiInPresentationHash = {
      ...structuredClone(baseTrack),
      presentation_hash: "alice.secret@client-corp.example" as Sha256Digest,
    };
    const piiHashRes = validateTemplateAgainstMetamodel(deepFreeze(piiInPresentationHash));
    expect(piiHashRes.status).toBe("refused-metamodel-invalid");
    if (piiHashRes.status === "refused-metamodel-invalid") {
      expect(
        piiHashRes.diagnostics.some((d) => d.code === "MM_PRIVACY_DENYLIST_VIOLATION" && d.path === "presentation_hash"),
      ).toBe(true);
    }

    // Valid sha256 digest at declared composed_lineage_pins[0].templateDigestSha256 IS exempt even if a custom deny-list pattern matches hex.
    const hexDeny = createConfidentialityDenyListV1({
      version: "test.hex-deny/v1",
      saltedTermHashes: [],
      deterministicPatterns: ["deadbeef"],
      piiCategoryRules: ["email"],
    });
    expect(hexDeny.ok).toBe(true);
    if (hexDeny.ok) {
      const digestWithHex = `sha256:${"deadbeef".repeat(8)}` as Sha256Digest;
      const validPinTemplate = {
        ...structuredClone(baseTrack),
        composed_lineage_pins: [
          {
            importAlias: "archi_v1",
            lineage: "archi" as const,
            templateId: "archi",
            templateVersion: "1.0.0",
            templateDigestSha256: digestWithHex,
          },
        ],
      };
      const res = validateTemplateAgainstMetamodel(deepFreeze(validPinTemplate), {
        privacy: { denyList: hexDeny.value },
      });
      expect(res.status).toBe("accepted");

      // Same token in a non-digest field is caught and localized accurately.
      const leakedInDesc = structuredClone(baseTrack);
      leakedInDesc.node_types.Task = {
        ...leakedInDesc.node_types.Task!,
        definition: "contains deadbeef token",
      };
      expectSingleDiagnostic(
        deepFreeze(leakedInDesc),
        "MM_PRIVACY_DENYLIST_VIOLATION",
        "node_types.Task.definition",
        { privacy: { denyList: hexDeny.value } },
      );
    }

    // customMatcher still runs and localizes exact paths when whole-doc deny-list is clean.
    expectSingleDiagnostic(
      deepFreeze(structuredClone(baseTrack)),
      "MM_PRIVACY_DENYLIST_VIOLATION",
      "node_types.Task.definition",
      {
        privacy: {
          customMatcher: (value) => (value.includes("Minimal trackable") ? "custom-rule" : null),
        },
      },
    );
  });

  it("MAJOR-03: rejects ReDoS nested quantifiers, ambiguous repeated alternations, invalid regex, and >256 char patterns", () => {
    const baseTrack = buildMinimalTrackTemplate();
    // Invalid Unicode regex syntax fails with MM_REGEX_INVALID_UNICODE.
    const unclosedAttr = structuredClone(baseTrack);
    unclosedAttr.node_types.Task = {
      ...unclosedAttr.node_types.Task!,
      attributes: { title: { kind: "string", pattern: "[unclosed" } },
    };
    expectSingleDiagnostic(
      deepFreeze(unclosedAttr),
      "MM_REGEX_INVALID_UNICODE",
      "node_types.Task.attributes.title.pattern",
    );
    const unclosedAxis = {
      ...structuredClone(baseTrack),
      domain_policies: { cross_cutting_axes: { wbs: { attribute: "wbs_code", pattern: "[unclosed" } } },
    };
    expectSingleDiagnostic(
      deepFreeze(unclosedAxis),
      "MM_REGEX_INVALID_UNICODE",
      "domain_policies.cross_cutting_axes.wbs.pattern",
    );

    const badPatterns = [
      "(a+)+$",
      "(a*)*",
      "(a+)*",
      "(a*)+",
      "((a+))+",
      "([a-z]{1,4})+",
      "(a|aa)+",
      "a".repeat(257),
    ];

    for (const pattern of badPatterns) {
      const attrCandidate = structuredClone(baseTrack);
      attrCandidate.node_types.Task = {
        ...attrCandidate.node_types.Task!,
        attributes: {
          title: { kind: "string", pattern },
        },
      };
      expectSingleDiagnostic(
        deepFreeze(attrCandidate),
        "MM_ATTR_INVALID_DECLARATION",
        "node_types.Task.attributes.title.pattern",
      );

      const axisCandidate = {
        ...structuredClone(baseTrack),
        domain_policies: {
          cross_cutting_axes: {
            wbs: { attribute: "wbs_code", pattern },
          },
        },
      };
      expectSingleDiagnostic(
        deepFreeze(axisCandidate),
        "MM_DOMAIN_POLICY_INVALID",
        "domain_policies.cross_cutting_axes.wbs.pattern",
      );
    }

    // Boundary: exact 256-char valid pattern is accepted.
    const exact256 = structuredClone(baseTrack);
    exact256.node_types.Task = {
      ...exact256.node_types.Task!,
      attributes: {
        title: { kind: "string", pattern: "a".repeat(256) },
      },
    };
    expect(validateTemplateAgainstMetamodel(deepFreeze(exact256)).status).toBe("accepted");
  });

  it("MAJOR-04: isolates single-defect negative tests for previously masked and untested invariants", () => {
    const baseTrack = buildMinimalTrackTemplate();
    const fullTrack = buildCompleteTrackTemplate();

    // M04a: min > max isolated
    const badMinMax = structuredClone(baseTrack);
    badMinMax.node_types.Task = {
      ...badMinMax.node_types.Task!,
      attributes: { score: { kind: "integer", min: 10, max: 5 } },
    };
    expectSingleDiagnostic(deepFreeze(badMinMax), "MM_ATTR_INVALID_DECLARATION", "node_types.Task.attributes.score");

    // minLength > maxLength isolated
    const badLen = structuredClone(baseTrack);
    badLen.node_types.Task = {
      ...badLen.node_types.Task!,
      attributes: { title: { kind: "string", minLength: 20, maxLength: 5 } },
    };
    expectSingleDiagnostic(deepFreeze(badLen), "MM_ATTR_INVALID_DECLARATION", "node_types.Task.attributes.title");

    // minItems > maxItems isolated
    const badItems = structuredClone(baseTrack);
    badItems.node_types.Task = {
      ...badItems.node_types.Task!,
      attributes: {
        tags: { kind: "collection", minItems: 5, maxItems: 2, item: { kind: "string" } },
      },
    };
    expectSingleDiagnostic(deepFreeze(badItems), "MM_ATTR_INVALID_DECLARATION", "node_types.Task.attributes.tags");

    // M04b: ref.targetTypes unknown local type
    const badLocalRef = structuredClone(baseTrack);
    badLocalRef.node_types.Task = {
      ...badLocalRef.node_types.Task!,
      attributes: { parent: { kind: "ref", targetTypes: ["UnknownLocalNode"] } },
    };
    expectSingleDiagnostic(
      deepFreeze(badLocalRef),
      "MM_ATTR_INVALID_DECLARATION",
      "node_types.Task.attributes.parent.targetTypes[0]",
    );

    // M07a: overlapping severity_bands isolated
    const overlapRisk = structuredClone(fullTrack);
    overlapRisk.domain_policies = {
      ...overlapRisk.domain_policies!,
      risk_policy: {
        ...overlapRisk.domain_policies!.risk_policy!,
        severity_bands: [
          { id: "low", min_score: 1, max_score: 6 },
          { id: "high", min_score: 5, max_score: 25 },
        ],
        max_review_validity_days_by_band: { low: 90, high: 7 },
      },
    };
    expectSingleDiagnostic(
      deepFreeze(overlapRisk),
      "MM_DOMAIN_POLICY_INVALID",
      "domain_policies.risk_policy.severity_bands",
    );

    // M07b: nesting_matrix.allowed_child_levels undeclared level
    const badNesting = structuredClone(fullTrack);
    badNesting.domain_policies = {
      ...badNesting.domain_policies!,
      nesting_matrix: [
        { parent_level: "initiative", parent_modes: ["build"], allowed_child_levels: ["ghost_level"] },
      ],
    };
    expectSingleDiagnostic(
      deepFreeze(badNesting),
      "MM_DOMAIN_POLICY_INVALID",
      "domain_policies.nesting_matrix[0].allowed_child_levels",
    );

    // M07c: negative levels[].rank isolated
    const negativeRank = {
      ...structuredClone(baseTrack),
      domain_policies: {
        levels: [{ id: "root", rank: -1 }],
      },
    };
    expectSingleDiagnostic(deepFreeze(negativeRank), "MM_DOMAIN_POLICY_INVALID", "domain_policies.levels[0].rank");

    // M07d: non-positive timeboxes[].hard_ceiling_days isolated
    const badTimebox = structuredClone(fullTrack);
    badTimebox.domain_policies = {
      ...badTimebox.domain_policies!,
      timeboxes: [
        {
          applies_to_level: "feature",
          hard_ceiling_days: 0,
          clock_start_trigger: "realization:in-progress",
          clock_stop_triggers: ["realization:closed"],
        },
      ],
    };
    expectSingleDiagnostic(
      deepFreeze(badTimebox),
      "MM_DOMAIN_POLICY_INVALID",
      "domain_policies.timeboxes[0].hard_ceiling_days",
    );

    // M08a: isolated link_fingerprint_sidecar missing (while content_mode === "both" is valid)
    const missingSidecar = structuredClone(fullTrack);
    const sliceCopy = structuredClone(fullTrack.file_projections!.default_pr_slice!) as Record<string, unknown>;
    delete sliceCopy.link_fingerprint_sidecar;
    missingSidecar.file_projections = {
      default_pr_slice: sliceCopy as unknown as NonNullable<MetamodelTemplateDocument["file_projections"]>[string],
    };
    expectSingleDiagnostic(
      deepFreeze(missingSidecar),
      "MM_FILE_SHAPE_INCOMPLETE_D29_PAIR",
      "file_projections.default_pr_slice.link_fingerprint_sidecar",
    );

    // M10: isolated expired writerMandate.expiresAt <= now
    expectSingleDiagnostic(
      deepFreeze(structuredClone(baseTrack)),
      "MM_AUTH_MANDATE_MISSING_OR_INVALID",
      "auth.writerMandate.expiresAt",
      {
        auth: {
          writerMandate: validMandate(["engram:register-template:track"], {
            expiresAt: "2026-11-24T12:00:00.000Z",
          }),
          callerProvider: "sentropic.track",
          now: "2026-11-24T12:00:00.000Z",
          verifySignature: () => true,
        },
      },
    );

    // Isolated invalid signer role
    expectSingleDiagnostic(
      deepFreeze(structuredClone(baseTrack)),
      "MM_AUTH_MANDATE_MISSING_OR_INVALID",
      "auth.writerMandate.role",
      {
        auth: {
          writerMandate: validMandate(["engram:register-template:track"], { role: "AGENTS" }),
          callerProvider: "sentropic.track",
          now: "2026-11-24T12:00:00.000Z",
          verifySignature: () => true,
        },
      },
    );

    // Isolated failed verifySignature
    expectSingleDiagnostic(
      deepFreeze(structuredClone(baseTrack)),
      "MM_AUTH_MANDATE_MISSING_OR_INVALID",
      "auth.writerMandate.signatures",
      {
        auth: {
          writerMandate: validMandate(["engram:register-template:track"]),
          callerProvider: "sentropic.track",
          now: "2026-11-24T12:00:00.000Z",
          verifySignature: () => false,
        },
      },
    );

    // Isolated wrong callerProvider
    expectSingleDiagnostic(
      deepFreeze(structuredClone(baseTrack)),
      "MM_AUTH_LINEAGE_SOLE_AUTHOR_VIOLATION",
      "auth.callerProvider",
      {
        auth: {
          writerMandate: validMandate(["engram:register-template:track"]),
          callerProvider: "sentropic.h2a",
          now: "2026-11-24T12:00:00.000Z",
          verifySignature: () => true,
        },
      },
    );

    // Isolated empty from/to in node state_machine transition
    const emptySmFrom = structuredClone(baseTrack);
    emptySmFrom.node_types.Task = {
      ...emptySmFrom.node_types.Task!,
      state_machine: {
        states: ["open", "done"],
        initial_state: "open",
        transitions: [{ from: [], to: ["done"] }],
      },
    };
    expectSingleDiagnostic(
      deepFreeze(emptySmFrom),
      "MM_STATE_INVALID_MACHINE",
      "node_types.Task.state_machine.transitions[0].from",
    );

    const emptySmTo = structuredClone(baseTrack);
    emptySmTo.node_types.Task = {
      ...emptySmTo.node_types.Task!,
      state_machine: {
        states: ["open", "done"],
        initial_state: "open",
        transitions: [{ from: ["open"], to: [] }],
      },
    };
    expectSingleDiagnostic(
      deepFreeze(emptySmTo),
      "MM_STATE_INVALID_MACHINE",
      "node_types.Task.state_machine.transitions[0].to",
    );
  });

  it("MINOR-01: malformed RegisteredTemplateRecord.templateDigestSha256 refuses cleanly without throwing", () => {
    const baseTrack = buildMinimalTrackTemplate();
    const candidate = {
      ...structuredClone(baseTrack),
      version: "1.1.0",
      parent_pin: {
        id: baseTrack.id,
        version: "1.0.0",
        contentDigest: toInternalDigest(semanticProfileDigest(baseTrack)),
      },
    };
    expectSingleDiagnostic(
      deepFreeze(candidate),
      "MM_VERSION_PARENT_PIN_MISSING_OR_MISMATCH",
      "parent_pin",
      {
        registry: [
          {
            lineage: "track",
            templateId: baseTrack.id,
            templateVersion: "1.0.0",
            templateDigestSha256: "not-a-valid-sha256" as Sha256Digest,
            document: baseTrack,
          },
        ],
      },
    );
  });

  it("MINOR-02: diffs domain_policies, state_machine(s), hardening, and file_projections removals as breaking", () => {
    const fullTrack = buildCompleteTrackTemplate();
    const fullTrackDigest = semanticProfileDigest(fullTrack);
    const parentPin = {
      id: fullTrack.id,
      version: "1.0.0",
      contentDigest: toInternalDigest(fullTrackDigest),
    };
    const registry = [
      {
        lineage: "track" as const,
        templateId: fullTrack.id,
        templateVersion: "1.0.0",
        templateDigestSha256: fullTrackDigest,
        document: fullTrack,
      },
    ];

    // 1. Removing a level from domain_policies.levels fails on MINOR bump.
    const removedLevel = structuredClone(fullTrack);
    removedLevel.version = "1.1.0";
    removedLevel.parent_pin = parentPin;
    removedLevel.domain_policies = {
      ...removedLevel.domain_policies!,
      levels: removedLevel.domain_policies!.levels!.filter((l) => l.id !== "task"),
      nesting_matrix: removedLevel.domain_policies!.nesting_matrix!.filter((r) => !r.allowed_child_levels.includes("task")),
      autonomy_policy: {
        ...removedLevel.domain_policies!.autonomy_policy!,
        autonomous_stage_ceiling_by_level: { feature: "verified" },
      },
    };
    expectSingleDiagnostic(deepFreeze(removedLevel), "MM_VERSION_MAJOR_REQUIRED_FOR_BREAKING", "version", { registry });

    // Same removal passes on MAJOR bump.
    const removedLevelMajor = { ...structuredClone(removedLevel), version: "2.0.0" };
    expect(validateTemplateAgainstMetamodel(deepFreeze(removedLevelMajor), { registry }).status).toBe("accepted");

    // 2. Removing a state from node_types.DecisionDossier.state_machine fails on MINOR bump.
    const removedState = structuredClone(fullTrack);
    removedState.version = "1.1.0";
    removedState.parent_pin = parentPin;
    removedState.node_types.DecisionDossier = {
      ...removedState.node_types.DecisionDossier!,
      state_machine: {
        states: ["draft", "open", "settled"],
        initial_state: "draft",
        terminal_states: ["settled"],
        transitions: [
          { from: ["draft"], to: ["open"], authority: "author" },
          { from: ["open"], to: ["settled"], authority: "mandated-act" },
        ],
      },
    };
    expectSingleDiagnostic(deepFreeze(removedState), "MM_VERSION_MAJOR_REQUIRED_FOR_BREAKING", "version", { registry });

    // 3. Adding a state to state_machine fails on PATCH bump.
    const addedStatePatch = structuredClone(fullTrack);
    addedStatePatch.version = "1.0.1";
    addedStatePatch.parent_pin = parentPin;
    addedStatePatch.node_types.DecisionDossier = {
      ...addedStatePatch.node_types.DecisionDossier!,
      state_machine: {
        states: ["draft", "open", "reviewing", "settled", "superseded"],
        initial_state: "draft",
        terminal_states: ["settled", "superseded"],
        transitions: [
          { from: ["draft"], to: ["open"], authority: "author" },
          { from: ["open"], to: ["reviewing"], authority: "author" },
          { from: ["open", "reviewing"], to: ["settled"], authority: "mandated-act" },
          { from: ["settled"], to: ["superseded"], authority: "mandated-act" },
        ],
      },
    };
    expectSingleDiagnostic(deepFreeze(addedStatePatch), "MM_VERSION_MINOR_REQUIRED_FOR_ADDITIVE", "version", { registry });

    // 4. Removing a state axis in state_machines fails on MINOR bump.
    const removedAxis = structuredClone(fullTrack);
    removedAxis.version = "1.1.0";
    removedAxis.parent_pin = parentPin;
    removedAxis.node_types.WorkItem = {
      ...removedAxis.node_types.WorkItem!,
      state_machines: {
        realization: structuredClone(removedAxis.node_types.WorkItem!.state_machines!.realization!),
      },
    };
    expectSingleDiagnostic(deepFreeze(removedAxis), "MM_VERSION_MAJOR_REQUIRED_FOR_BREAKING", "version", { registry });

    // 5. Removing a projection or stage_vocabulary entry from file_projections fails on MINOR bump.
    const removedProjection = structuredClone(fullTrack);
    removedProjection.version = "1.1.0";
    removedProjection.parent_pin = parentPin;
    removedProjection.file_projections = {
      default_pr_slice: structuredClone(fullTrack.file_projections!.default_pr_slice!),
    };
    expectSingleDiagnostic(deepFreeze(removedProjection), "MM_VERSION_MAJOR_REQUIRED_FOR_BREAKING", "version", { registry });

    const removedStageVocab = structuredClone(fullTrack);
    removedStageVocab.version = "1.1.0";
    removedStageVocab.parent_pin = parentPin;
    (removedStageVocab.file_projections!.factual_report_snapshot as { state_snapshot: { stage_vocabulary: string[] } })
      .state_snapshot.stage_vocabulary = ["request-recorded", "in-implementation"];
    expectSingleDiagnostic(deepFreeze(removedStageVocab), "MM_VERSION_MAJOR_REQUIRED_FOR_BREAKING", "version", { registry });

    // Tightening timeboxes[].hard_ceiling_days fails on MINOR bump.
    const tightenedTimebox = structuredClone(fullTrack);
    tightenedTimebox.version = "1.1.0";
    tightenedTimebox.parent_pin = parentPin;
    tightenedTimebox.domain_policies = {
      ...tightenedTimebox.domain_policies!,
      timeboxes: [
        {
          ...tightenedTimebox.domain_policies!.timeboxes![0]!,
          hard_ceiling_days: 15,
        },
      ],
    };
    expectSingleDiagnostic(deepFreeze(tightenedTimebox), "MM_VERSION_MAJOR_REQUIRED_FOR_BREAKING", "version", { registry });

    // 6. Removing a hardening status fails on MINOR bump.
    const baseWithHardening: MetamodelTemplateDocument = {
      ...buildMinimalTrackTemplate(),
      hardening: {
        statuses: ["candidate", "validated", "archived"],
        default_status: "candidate",
        status_transitions: [{ from: ["candidate"], to: ["validated"] }],
      },
    };
    const hardeningDigest = semanticProfileDigest(baseWithHardening);
    const removedHardeningStatus: MetamodelTemplateDocument = {
      ...structuredClone(baseWithHardening),
      version: "1.1.0",
      parent_pin: {
        id: baseWithHardening.id,
        version: "1.0.0",
        contentDigest: toInternalDigest(hardeningDigest),
      },
      hardening: {
        statuses: ["candidate", "validated"],
        default_status: "candidate",
        status_transitions: [{ from: ["candidate"], to: ["validated"] }],
      },
    };
    expectSingleDiagnostic(deepFreeze(removedHardeningStatus), "MM_VERSION_MAJOR_REQUIRED_FOR_BREAKING", "version", {
      registry: [
        {
          lineage: "track",
          templateId: baseWithHardening.id,
          templateVersion: "1.0.0",
          templateDigestSha256: hardeningDigest,
          document: baseWithHardening,
        },
      ],
    });
  });

  it("MINOR-03: rejects empty-string multi-axis state values and non-record node.states / node.previous_states", () => {
    const rawProfile: OntologyProfile = {
      metamodel_version: "engram.metamodel/v1",
      id: "multi-axis-edge",
      version: "1.0.0",
      citation_policy: { minimum_granularity: "file", require_source_file: false },
      node_types: {
        Feature: {
          state_machines: {
            specification: {
              states: ["draft", "specified"],
              initial_state: "draft",
              transitions: [{ from: ["draft"], to: ["specified"] }],
            },
          },
        } as unknown as OntologyProfile["node_types"][string],
      },
      relation_types: {},
    };
    const normalized = normalizeOntologyProfile(rawProfile);

    const makeExtraction = (nodePatch: Record<string, unknown>): Extraction => ({
      nodes: [
        {
          id: "feat-1",
          label: "Feature 1",
          file_type: "document",
          source_file: "spec.md",
          node_type: "Feature",
          ...nodePatch,
        },
      ],
      edges: [],
      input_tokens: 0,
      output_tokens: 0,
    });

    const emptyAxis = validateProfileExtraction(makeExtraction({ states: { specification: "" } }), { profile: normalized });
    expect(emptyAxis.valid).toBe(false);
    expect(emptyAxis.issues).toContainEqual(
      expect.objectContaining({
        severity: "error",
        code: "unknown_status",
        path: "nodes[0].states.specification",
      }),
    );

    const nonRecordStates = validateProfileExtraction(makeExtraction({ states: "bogus" }), { profile: normalized });
    expect(nonRecordStates.valid).toBe(false);
    expect(nonRecordStates.issues).toContainEqual(
      expect.objectContaining({
        severity: "error",
        code: "unknown_status",
        path: "nodes[0].states",
      }),
    );

    const nonRecordPrev = validateProfileExtraction(
      makeExtraction({ states: { specification: "specified" }, previous_states: "bogus" }),
      { profile: normalized },
    );
    expect(nonRecordPrev.valid).toBe(false);
    expect(nonRecordPrev.issues).toContainEqual(
      expect.objectContaining({
        severity: "error",
        code: "unknown_previous_status",
        path: "nodes[0].previous_states",
      }),
    );

    const emptyPrevAxis = validateProfileExtraction(
      makeExtraction({ states: { specification: "specified" }, previous_states: { specification: "   " } }),
      { profile: normalized },
    );
    expect(emptyPrevAxis.valid).toBe(false);
    expect(emptyPrevAxis.issues).toContainEqual(
      expect.objectContaining({
        severity: "error",
        code: "unknown_previous_status",
        path: "nodes[0].previous_states.specification",
      }),
    );
  });

  it("MINOR-04: rejects non-plain doc.presentation and accepts plain presentation object", () => {
    const baseTrack = buildMinimalTrackTemplate();
    expectSingleDiagnostic(
      deepFreeze({ ...structuredClone(baseTrack), presentation: "not-an-object" }),
      "MM_SYNTAX_NON_PLAIN_OBJECT",
      "presentation",
    );
    expect(
      validateTemplateAgainstMetamodel(deepFreeze({ ...structuredClone(baseTrack), presentation: { theme: "light" } }))
        .status,
    ).toBe("accepted");
  });

  it("MINOR-05: rejects hardening status_transitions with empty from/to or invalid requires", () => {
    const baseTrack = buildMinimalTrackTemplate();
    expectSingleDiagnostic(
      deepFreeze({
        ...structuredClone(baseTrack),
        hardening: {
          statuses: ["open", "done"],
          default_status: "open",
          status_transitions: [{ from: [], to: ["done"] }],
        },
      }),
      "MM_STATE_INVALID_MACHINE",
      "hardening.status_transitions[0].from",
    );
    expectSingleDiagnostic(
      deepFreeze({
        ...structuredClone(baseTrack),
        hardening: {
          statuses: ["open", "done"],
          default_status: "open",
          status_transitions: [{ from: ["open"], to: [] }],
        },
      }),
      "MM_STATE_INVALID_MACHINE",
      "hardening.status_transitions[0].to",
    );
    expectSingleDiagnostic(
      deepFreeze({
        ...structuredClone(baseTrack),
        hardening: {
          statuses: ["open", "done"],
          default_status: "open",
          status_transitions: [{ from: ["open"], to: ["done"], requires: [123] }],
        },
      }),
      "MM_STATE_INVALID_MACHINE",
      "hardening.status_transitions[0].requires",
    );
  });

  it("MINOR-06: requires declared states/stages when stage_refinements or autonomous_stage_ceiling_by_level is present", () => {
    const statelessBase = {
      metamodel_version: "engram.metamodel/v1" as const,
      lineage: "track" as const,
      id: "sentropic.stateless",
      version: "1.0.0",
      node_types: {
        Task: { definition: "Task with no state machine." },
      },
    };
    expectSingleDiagnostic(
      deepFreeze({
        ...structuredClone(statelessBase),
        domain_policies: {
          stage_refinements: [{ parent_stage: "undeclared_stage", sub_stages: ["sub"] }],
        },
      }),
      "MM_DOMAIN_POLICY_INVALID",
      "domain_policies.stage_refinements[0].parent_stage",
    );
    expectSingleDiagnostic(
      deepFreeze({
        ...structuredClone(statelessBase),
        domain_policies: {
          levels: [{ id: "task", rank: 0 }],
          autonomy_policy: {
            actor_classes: ["agent"],
            autonomous_stage_ceiling_by_level: { task: "undeclared_stage" },
          },
        },
      }),
      "MM_DOMAIN_POLICY_INVALID",
      "domain_policies.autonomy_policy.autonomous_stage_ceiling_by_level.task",
    );
  });

  it("MINOR-08: enforces attribute kind constraints, pin templateId, closed external target, and relation metadata", () => {
    const baseTrack = buildMinimalTrackTemplate();

    // MINOR-08a: pattern/minLength/maxLength restricted to string-like kinds; min/max restricted to numeric kinds
    const patternOnInt = structuredClone(baseTrack);
    patternOnInt.node_types.Task = {
      ...patternOnInt.node_types.Task!,
      attributes: { count: { kind: "integer", pattern: "^[0-9]+$" } },
    };
    expectSingleDiagnostic(
      deepFreeze(patternOnInt),
      "MM_ATTR_INVALID_DECLARATION",
      "node_types.Task.attributes.count.pattern",
    );

    const minOnString = structuredClone(baseTrack);
    minOnString.node_types.Task = {
      ...minOnString.node_types.Task!,
      attributes: { title: { kind: "string", min: 1 } },
    };
    expectSingleDiagnostic(
      deepFreeze(minOnString),
      "MM_ATTR_INVALID_DECLARATION",
      "node_types.Task.attributes.title.min",
    );

    // MINOR-08b (isolated single-defect check): invalid composed_lineage_pins[0].templateId
    const badPinIdOnly = {
      ...structuredClone(baseTrack),
      composed_lineage_pins: [
        {
          importAlias: "bad_alias",
          lineage: "archi" as const,
          templateId: "123 invalid id",
          templateVersion: "1.0.0",
          templateDigestSha256: ARCHI_V1_SHA256,
        },
      ],
    };
    expectSingleDiagnostic(
      deepFreeze(badPinIdOnly),
      "MM_COMPOSE_TARGET_NOT_REGISTERED",
      "composed_lineage_pins[0].templateId",
    );

    // Follow-on check: an invalid pin must NOT register its alias into pinByAlias, so referencing it also fails.
    const badPinIdWithExternalRel = {
      ...structuredClone(badPinIdOnly),
      relation_types: {
        links_bad: {
          source_types: ["Task"],
          target_types: ["bad_alias:runtime"],
        },
      },
    };
    const badPinIdRes = validateTemplateAgainstMetamodel(deepFreeze(badPinIdWithExternalRel));
    expect(badPinIdRes.status).toBe("refused-metamodel-invalid");
    if (badPinIdRes.status === "refused-metamodel-invalid") {
      expect(badPinIdRes.diagnostics.map((d) => ({ code: d.code, path: d.path }))).toEqual([
        { code: "MM_COMPOSE_TARGET_NOT_REGISTERED", path: "composed_lineage_pins[0].templateId" },
        { code: "MM_COMPOSE_UNKNOWN_EXTERNAL_TYPE", path: "relation_types.links_bad.target_types[0]" },
      ]);
    }

    // MINOR-08c: RegisteredTemplateRecord omitting both nodeTypeIds and document fails closed
    const extRefTemplate = {
      ...structuredClone(baseTrack),
      composed_lineage_pins: [
        {
          importAlias: "archi_v1",
          lineage: "archi" as const,
          templateId: "archi",
          templateVersion: "1.0.0",
          templateDigestSha256: ARCHI_V1_SHA256,
        },
      ],
      relation_types: {
        uses_runtime: {
          source_types: ["Task"],
          target_types: ["archi_v1:runtime"],
        },
      },
    };
    expectSingleDiagnostic(
      deepFreeze(extRefTemplate),
      "MM_COMPOSE_UNKNOWN_EXTERNAL_TYPE",
      "relation_types.uses_runtime.target_types[0]",
      {
        registry: [
          {
            lineage: "archi",
            templateId: "archi",
            templateVersion: "1.0.0",
            templateDigestSha256: ARCHI_V1_SHA256,
          },
        ],
      },
    );

    // MINOR-08d: relation_types requires_evidence, assertion_basis, derivation_methods type-checked
    const badRelEvidence = structuredClone(baseTrack);
    (badRelEvidence.relation_types!.depends_on as Record<string, unknown>).requires_evidence = "yes";
    expectSingleDiagnostic(
      deepFreeze(badRelEvidence),
      "MM_ATTR_INVALID_DECLARATION",
      "relation_types.depends_on.requires_evidence",
    );

    const badRelBasis = structuredClone(baseTrack);
    (badRelBasis.relation_types!.depends_on as Record<string, unknown>).assertion_basis = [42];
    expectSingleDiagnostic(
      deepFreeze(badRelBasis),
      "MM_ATTR_INVALID_DECLARATION",
      "relation_types.depends_on.assertion_basis",
    );

    const badRelDeriv = structuredClone(baseTrack);
    (badRelDeriv.relation_types!.depends_on as Record<string, unknown>).derivation_methods = "explicit";
    expectSingleDiagnostic(
      deepFreeze(badRelDeriv),
      "MM_ATTR_INVALID_DECLARATION",
      "relation_types.depends_on.derivation_methods",
    );
  });
});

describe("round-3 guard design note: canonical path, open-key iteration, AST regex safety, and mutant kills", () => {
  it("R3-MAJOR-01: refuses wrapper-group ReDoS, polynomial sequential quantifiers, backreferences, and linking regexes", () => {
    const baseTrack = buildMinimalTrackTemplate();
    const unsafePatterns = [
      "((a|aa))+",
      "(?:(a|aa))+",
      "((a|a)b)+",
      "((?:a|ab))+",
      "(((a|ab)))+",
      "(a|(a|b))+",
      "([a-z]|a)+",
      "^" + "a*".repeat(10) + "b$",
      "^" + "a*".repeat(30) + "b$",
      ".*.*",
      "\\d*\\d*",
      "(?:a*){1}a*",
      "a*b?a*",
      ".*a.*b",
      "a*(?:b|aa*)",
      "^" + "(?:a|aa)".repeat(10) + "b$",
      "(a)\\1+",
      "((?=a)a)+",
      "(a?)*",
      "(a{40}){40}",
      "^WBS-[0-9]{2}(\\.[0-9]{2})*$",
    ];

    for (const pattern of unsafePatterns) {
      const attrCandidate = structuredClone(baseTrack);
      attrCandidate.node_types.Task = {
        ...attrCandidate.node_types.Task!,
        attributes: { title: { kind: "string", pattern } },
      };
      expectSingleDiagnostic(
        deepFreeze(attrCandidate),
        "MM_ATTR_INVALID_DECLARATION",
        "node_types.Task.attributes.title.pattern",
      );

      const axisCandidate = {
        ...structuredClone(baseTrack),
        domain_policies: {
          cross_cutting_axes: { wbs: { attribute: "wbs_code", pattern } },
        },
      };
      expectSingleDiagnostic(
        deepFreeze(axisCandidate),
        "MM_DOMAIN_POLICY_INVALID",
        "domain_policies.cross_cutting_axes.wbs.pattern",
      );
    }

    // Safe patterns remain accepted.
    const safePatterns = [
      "((a|b))+",
      "^[a-z]+-[0-9]+$",
      "^WBS-[0-9]{2}(\\.[0-9][0-9])*$",
      "^[a-z]+_[a-z]+$",
      "^(foo|foobar)-(bar|barbaz)$",
      "^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)$",
    ];
    for (const pattern of safePatterns) {
      const candidate = structuredClone(baseTrack);
      candidate.node_types.Task = {
        ...candidate.node_types.Task!,
        attributes: { title: { kind: "string", pattern } },
      };
      expect(validateTemplateAgainstMetamodel(deepFreeze(candidate)).status, `Expected safe pattern ${pattern}`).toBe(
        "accepted",
      );
    }

    // Rule 3 applied to node linking.patterns[].form and linking.detect[].pattern.form
    const badLinkingPatterns = structuredClone(baseTrack);
    badLinkingPatterns.node_types.Task = {
      ...badLinkingPatterns.node_types.Task!,
      linking: {
        patterns: [{ form: "((a|aa))+" }],
      },
    };
    expectSingleDiagnostic(
      deepFreeze(badLinkingPatterns),
      "MM_NODE_INVALID_IDENTIFIER",
      "node_types.Task.linking.patterns[0].form",
    );

    const badLinkingDetect = structuredClone(baseTrack);
    badLinkingDetect.node_types.Task = {
      ...badLinkingDetect.node_types.Task!,
      linking: {
        detect: [{ pattern: { form: "^" + "a*".repeat(10) + "b$" } }],
      },
    };
    expectSingleDiagnostic(
      deepFreeze(badLinkingDetect),
      "MM_NODE_INVALID_IDENTIFIER",
      "node_types.Task.linking.detect[0].pattern.form",
    );

    const validLinking = structuredClone(baseTrack);
    validLinking.node_types.Task = {
      ...validLinking.node_types.Task!,
      linking: {
        patterns: [{ form: "^WI-[0-9]{4}$" }],
        detect: [{ pattern: { form: "^[A-Z]{2,4}-[0-9]{3}$" } }],
      },
    };
    expect(validateTemplateAgainstMetamodel(deepFreeze(validLinking)).status).toBe("accepted");
  });

  it("R3-MAJOR-02: refuses extra relative_path_templates & projection keys, placeholder traversal, and 5x-encoded overlay paths", () => {
    const fullTrack = buildCompleteTrackTemplate();
    const fullTrackDigest = semanticProfileDigest(fullTrack);
    const baseH2a = buildCompleteH2aTemplate(fullTrackDigest);

    // 1. Extra keys in relative_path_templates (Track target vs path escape vs unknown tier)
    const rptExtraTrack = structuredClone(baseH2a);
    (rptExtraTrack.file_projections!.harness_overlay as { relative_path_templates: Record<string, string> })
      .relative_path_templates.extra = ".track/events.jsonl";
    expectSingleDiagnostic(
      deepFreeze(rptExtraTrack),
      "MM_OVERLAY_CROSS_LINEAGE_MUTATION_FORBIDDEN",
      "file_projections.harness_overlay.relative_path_templates.extra",
    );

    const rptExtra5xTrack = structuredClone(baseH2a);
    (rptExtra5xTrack.file_projections!.harness_overlay as { relative_path_templates: Record<string, string> })
      .relative_path_templates.extra = ".h2a/%252525252e%252525252e/%252525252e%2525252574rack/events.jsonl";
    expectSingleDiagnostic(
      deepFreeze(rptExtra5xTrack),
      "MM_OVERLAY_CROSS_LINEAGE_MUTATION_FORBIDDEN",
      "file_projections.harness_overlay.relative_path_templates.extra",
    );

    const rptExtraEscape = structuredClone(baseH2a);
    (rptExtraEscape.file_projections!.harness_overlay as { relative_path_templates: Record<string, string> })
      .relative_path_templates.extra = "../../outside.json";
    expectSingleDiagnostic(
      deepFreeze(rptExtraEscape),
      "MM_FILE_SHAPE_PATH_ESCAPE",
      "file_projections.harness_overlay.relative_path_templates.extra",
    );

    const rptExtraUnknownTier = structuredClone(baseH2a);
    (rptExtraUnknownTier.file_projections!.harness_overlay as { relative_path_templates: Record<string, string> })
      .relative_path_templates.extra = ".h2a/overlays/extra.json";
    expectSingleDiagnostic(
      deepFreeze(rptExtraUnknownTier),
      "MM_FILE_SHAPE_PATH_ESCAPE",
      "file_projections.harness_overlay.relative_path_templates.extra",
    );

    // 2. Extra keys on file_projections entries themselves (Object.entries full-key guard)
    const h2aExtraProjTrack = structuredClone(baseH2a);
    (h2aExtraProjTrack.file_projections!.harness_overlay as unknown as Record<string, unknown>).extra_target =
      ".track/events.jsonl";
    expectSingleDiagnostic(
      deepFreeze(h2aExtraProjTrack),
      "MM_OVERLAY_CROSS_LINEAGE_MUTATION_FORBIDDEN",
      "file_projections.harness_overlay.extra_target",
    );

    const h2aExtraProjEscape = structuredClone(baseH2a);
    (h2aExtraProjEscape.file_projections!.harness_overlay as unknown as Record<string, unknown>).extra_target =
      "../../outside.json";
    expectSingleDiagnostic(
      deepFreeze(h2aExtraProjEscape),
      "MM_FILE_SHAPE_PATH_ESCAPE",
      "file_projections.harness_overlay.extra_target",
    );

    const trackExtraProjKey = structuredClone(fullTrack);
    (trackExtraProjKey.file_projections!.default_pr_slice as unknown as Record<string, unknown>).extra_target =
      ".track/rogue.json";
    expectSingleDiagnostic(
      deepFreeze(trackExtraProjKey),
      "MM_FILE_SHAPE_PATH_ESCAPE",
      "file_projections.default_pr_slice.extra_target",
    );

    // 3. Placeholder-adjacent / composite traversal in Track and h2a paths
    const placeholderEscapeVectors = [
      ".track/{a}..{b}/events.jsonl",
      ".track/{a}.{b}/events.jsonl",
      ".track/{a}.{b}.{c}/events.jsonl",
      ".track/.{a}./events.jsonl",
      ".track/{a}{b}/events.jsonl",
      ".track/{a}..x/events.jsonl",
      ".track/x..{b}/events.jsonl",
    ];
    for (const badPath of placeholderEscapeVectors) {
      const candidate = structuredClone(fullTrack);
      (candidate.file_projections!.default_pr_slice as { event_journal: { relative_path_template: string } })
        .event_journal.relative_path_template = badPath;
      expectSingleDiagnostic(
        deepFreeze(candidate),
        "MM_FILE_SHAPE_PATH_ESCAPE",
        "file_projections.default_pr_slice.event_journal.relative_path_template",
      );
    }

    const h2aPlaceholderEscape = structuredClone(baseH2a);
    (h2aPlaceholderEscape.file_projections!.harness_overlay as { relative_path_template: string }).relative_path_template =
      ".h2a/overlays/{a}..{b}/overlay.json";
    expectSingleDiagnostic(
      deepFreeze(h2aPlaceholderEscape),
      "MM_FILE_SHAPE_PATH_ESCAPE",
      "file_projections.harness_overlay.relative_path_template",
    );

    const h2aPlaceholderTrack = structuredClone(baseH2a);
    (h2aPlaceholderTrack.file_projections!.harness_overlay as { relative_path_template: string }).relative_path_template =
      ".h2a/{a}.track/events.jsonl";
    expectSingleDiagnostic(
      deepFreeze(h2aPlaceholderTrack),
      "MM_OVERLAY_CROSS_LINEAGE_MUTATION_FORBIDDEN",
      "file_projections.harness_overlay.relative_path_template",
    );

    // 4. 5x+ percent-encoded and escaping overlayCheck.targetPaths & h2a root_dir via canonical helper
    const deepEncodedTrackTargets = [
      "%252525252e%2525252574rack/events.jsonl",
      ".h2a/%252525252e%252525252e/%252525252e%2525252574rack/events.jsonl",
      "%25%32%65%25%37%34rack/events.jsonl",
    ];
    for (const targetPath of deepEncodedTrackTargets) {
      expectSingleDiagnostic(
        deepFreeze(structuredClone(baseH2a)),
        "MM_OVERLAY_CROSS_LINEAGE_MUTATION_FORBIDDEN",
        "overlayCheck.targetPaths",
        { overlayCheck: { targetPaths: [targetPath] } },
      );
    }

    for (const escapedTarget of [".h2a/../outside.json", "/etc/passwd", ".h2a/{a}..{b}/overlay.json"]) {
      expectSingleDiagnostic(
        deepFreeze(structuredClone(baseH2a)),
        "MM_FILE_SHAPE_PATH_ESCAPE",
        "overlayCheck.targetPaths",
        { overlayCheck: { targetPaths: [escapedTarget] } },
      );
    }

    expect(
      validateTemplateAgainstMetamodel(deepFreeze(structuredClone(baseH2a)), {
        overlayCheck: { targetPaths: [".h2a/overlays/repo/harness-overlay.json"] },
      }).status,
    ).toBe("accepted");

    const h2a5xRootDir = structuredClone(baseH2a);
    (h2a5xRootDir.file_projections!.harness_overlay as { root_dir: string }).root_dir =
      "%252525252e%2525252574rack";
    expectSingleDiagnostic(
      deepFreeze(h2a5xRootDir),
      "MM_OVERLAY_CROSS_LINEAGE_MUTATION_FORBIDDEN",
      "file_projections.harness_overlay.root_dir",
    );
  });

  it("R3-OPEN-KEYS: applies Object.entries key checks to attributes (collection/record), node overrides, and admission_policy", () => {
    const baseTrack = buildMinimalTrackTemplate();

    const collectionPattern = structuredClone(baseTrack);
    collectionPattern.node_types.Task = {
      ...collectionPattern.node_types.Task!,
      attributes: {
        tags: { kind: "collection", item: { kind: "string" }, pattern: "(a+)+" } as unknown as NonNullable<
          MetamodelTemplateDocument["node_types"][string]["attributes"]
        >[string],
      },
    };
    expectSingleDiagnostic(
      deepFreeze(collectionPattern),
      "MM_ATTR_INVALID_DECLARATION",
      "node_types.Task.attributes.tags.pattern",
    );

    const recordPattern = structuredClone(baseTrack);
    recordPattern.node_types.Task = {
      ...recordPattern.node_types.Task!,
      attributes: {
        meta: {
          kind: "record",
          attributes: { code: { kind: "string" } },
          pattern: "(a+)+",
        } as unknown as NonNullable<MetamodelTemplateDocument["node_types"][string]["attributes"]>[string],
      },
    };
    expectSingleDiagnostic(
      deepFreeze(recordPattern),
      "MM_ATTR_INVALID_DECLARATION",
      "node_types.Task.attributes.meta.pattern",
    );

    const unknownAttrKey = structuredClone(baseTrack);
    unknownAttrKey.node_types.Task = {
      ...unknownAttrKey.node_types.Task!,
      attributes: {
        title: { kind: "string", extra_rule: true } as unknown as NonNullable<
          MetamodelTemplateDocument["node_types"][string]["attributes"]
        >[string],
      },
    };
    expectSingleDiagnostic(
      deepFreeze(unknownAttrKey),
      "MM_ATTR_INVALID_DECLARATION",
      "node_types.Task.attributes.title.extra_rule",
    );

    const nodeExtends = structuredClone(baseTrack);
    (nodeExtends.node_types.Task as unknown as Record<string, unknown>).extends = "archi_v1:runtime";
    expectSingleDiagnostic(
      deepFreeze(nodeExtends),
      "MM_COMPOSE_EXTERNAL_TYPE_REDEFINITION",
      "node_types.Task.extends",
    );

    const unknownAdmissionKey = structuredClone(baseTrack);
    unknownAdmissionKey.node_types.Task = {
      ...unknownAdmissionKey.node_types.Task!,
      admission_policy: {
        mode: "bounded-auto",
        by_stage: { draft: "bogus" },
      } as unknown as MetamodelTemplateDocument["node_types"][string]["admission_policy"],
    };
    expectSingleDiagnostic(
      deepFreeze(unknownAdmissionKey),
      "MM_STATE_INVALID_MACHINE",
      "node_types.Task.admission_policy.by_stage",
    );
  });

  it("R3-MUTANTS: kills Round-2 surviving mutants M01_yaml_proto_skip, M08b_path_dotdot_skip, and M15_track_normalize_skip", () => {
    // Kills M01_yaml_proto_skip (validate-syntax.ts:89): `.nan` triggers toJsonValue non_finite_number if AST check is skipped.
    const yamlProtoNan = [
      "metamodel_version: engram.metamodel/v1",
      "lineage: track",
      "id: sentropic.proto-nan",
      "version: 1.0.0",
      "__proto__: .nan",
      "node_types:",
      "  Task: {}",
    ].join("\n");
    expectSingleDiagnostic(yamlProtoNan, "MM_SYNTAX_FORBIDDEN_PROTO_KEY", "__proto__");

    // Kills M08b_path_dotdot_skip & M15_track_normalize_skip via direct canonicalizeConfinedPath invariants.
    const dotDot = canonicalizeConfinedPath("../outside");
    expect(dotDot.safe).toBe(false);
    expect(dotDot.normalized).toBe("../outside");

    const singleDot = canonicalizeConfinedPath(".");
    expect(singleDot.safe).toBe(false);
    expect(singleDot.normalized).toBe(".");

    const trailingSlash = canonicalizeConfinedPath(".track/events.jsonl/");
    expect(trailingSlash.safe).toBe(false);

    const absPath = canonicalizeConfinedPath("/etc/passwd");
    expect(absPath.safe).toBe(false);

    const drivePath = canonicalizeConfinedPath("C:/outside");
    expect(drivePath.safe).toBe(false);

    const unnormalized = canonicalizeConfinedPath(".track/a/../b");
    expect(unnormalized.safe).toBe(false);
    expect(unnormalized.normalized).toBe(".track/b");

    const clean = canonicalizeConfinedPath(".track/pr/{prBranchSlug}/events.jsonl");
    expect(clean.safe).toBe(true);
    expect(clean.touchesTrack).toBe(true);
    expect(clean.normalized).toBe(".track/pr/{prBranchSlug}/events.jsonl");
  });
});

describe("round-4 owner decision 25/11: BLOCKER-01 strict Unicode regex, MAJOR-01, and MINOR-01..03", () => {
  const blocker01Vectors: ReadonlyArray<{
    readonly id: string;
    readonly pattern: string;
    readonly expectedCode: MetamodelDiagnosticCode;
  }> = [
    { id: "V01-unicode-brace-open-quantifier", pattern: "^(\\u{1,})+$", expectedCode: "MM_REGEX_INVALID_UNICODE" },
    { id: "V02-unicode-brace-bounded-quantifier", pattern: "^(\\u{1,3})+$", expectedCode: "MM_REGEX_INVALID_UNICODE" },
    { id: "V03-lower-property-non-unicode-quantifier", pattern: "^(\\p{1,})+$", expectedCode: "MM_REGEX_INVALID_UNICODE" },
    { id: "V04-upper-property-non-unicode-quantifier", pattern: "^(\\P{1,})+$", expectedCode: "MM_REGEX_INVALID_UNICODE" },
    { id: "V05-empty-char-class-nested-quantifier", pattern: "^([]|(a+)+)$", expectedCode: "MM_ATTR_INVALID_DECLARATION" },
    { id: "V06-negated-empty-char-class-nested-quantifier", pattern: "^([^]|(a+)+)$", expectedCode: "MM_ATTR_INVALID_DECLARATION" },
    { id: "V07-control-letter-overlap-alternation", pattern: "^(\\cA|\\x01)+$", expectedCode: "MM_ATTR_INVALID_DECLARATION" },
    { id: "V08-class-backspace-overlap-alternation", pattern: "^([\\b]|\\x08)+$", expectedCode: "MM_ATTR_INVALID_DECLARATION" },
    { id: "V09-class-octal-escape-non-unicode", pattern: "^([\\1]|\\x01)+$", expectedCode: "MM_REGEX_INVALID_UNICODE" },
    { id: "V10-decimal-octal-escape-non-unicode", pattern: "^(\\01|\\x01)+$", expectedCode: "MM_REGEX_INVALID_UNICODE" },
  ];

  for (const vector of blocker01Vectors) {
    it(`R4-BLOCKER-01 ${vector.id}: refuses ${vector.pattern} with exact code ${vector.expectedCode}`, () => {
      const candidate = structuredClone(buildMinimalTrackTemplate());
      candidate.node_types.Task = {
        ...candidate.node_types.Task!,
        attributes: { title: { kind: "string", pattern: vector.pattern } },
      };
      expectSingleDiagnostic(
        deepFreeze(candidate),
        vector.expectedCode,
        "node_types.Task.attributes.title.pattern",
      );
    });
  }

  it("R4-OWNER-REGEX: enforces strict /u grammar, unmodeled escape refusal, no nested quantifiers, exact Unicode overlap, and MINOR-03", () => {
    const baseTrack = buildMinimalTrackTemplate();

    // Non-Unicode /u failures across cross_cutting_axes and linking call sites emit MM_REGEX_INVALID_UNICODE.
    const invalidUnicodePatterns = ["^\\a+$", "^[\\d-a]+$", "^a{$", "^(\\u{1,})+$"];
    for (const pattern of invalidUnicodePatterns) {
      const axisDoc = {
        ...structuredClone(baseTrack),
        domain_policies: { cross_cutting_axes: { wbs: { attribute: "wbs_code", pattern } } },
      };
      expectSingleDiagnostic(
        deepFreeze(axisDoc),
        "MM_REGEX_INVALID_UNICODE",
        "domain_policies.cross_cutting_axes.wbs.pattern",
      );

      const linkPatDoc = structuredClone(baseTrack);
      linkPatDoc.node_types.Task = { ...linkPatDoc.node_types.Task!, linking: { patterns: [{ form: pattern }] } };
      expectSingleDiagnostic(
        deepFreeze(linkPatDoc),
        "MM_REGEX_INVALID_UNICODE",
        "node_types.Task.linking.patterns[0].form",
      );

      const linkDetDoc = structuredClone(baseTrack);
      linkDetDoc.node_types.Task = {
        ...linkDetDoc.node_types.Task!,
        linking: { detect: [{ pattern: { form: pattern } }] },
      };
      expectSingleDiagnostic(
        deepFreeze(linkDetDoc),
        "MM_REGEX_INVALID_UNICODE",
        "node_types.Task.linking.detect[0].pattern.form",
      );
    }

    // Valid /u patterns refused by strict grammar (unmodeled property escapes, any nested quantifier, overlapping alternations, MINOR-03).
    const strictRefusedPatterns = [
      "^\\p{Letter}+$",
      "^\\P{ASCII}+$",
      "^[\\p{Letter}]+$",
      "^WBS-[0-9]{2}(\\.[0-9]{2})*$",
      "^(a{2})+$",
      "^(a+)?$",
      "^(?:a{1}){1}$",
      "^(?:ba*)?a*$",
      "^(\\u{61}|a)+$",
      "^(😀|\\u{1F600})+$",
      "^(\\uD83D\\uDE00|\\u{1F600})+$",
      "^(\\cZ|\\x1a)+$",
      "^([\\b]|[\\x08])+$",
      "^(\\D|a)+$",
      "^(\\w|\\d)+$",
      "^(\\s|\\u{2028})+$",
      "^([^]|a)+$",
      "^(a|aa)?$",
    ];
    for (const pattern of strictRefusedPatterns) {
      const candidate = structuredClone(baseTrack);
      candidate.node_types.Task = {
        ...candidate.node_types.Task!,
        attributes: { title: { kind: "string", pattern } },
      };
      expectSingleDiagnostic(
        deepFreeze(candidate),
        "MM_ATTR_INVALID_DECLARATION",
        "node_types.Task.attributes.title.pattern",
      );
    }

    // Strictly modeled Unicode patterns with no nested quantifiers and disjoint first sets remain accepted.
    const strictAcceptedPatterns = [
      "^WBS-[0-9]{2}(\\.[0-9][0-9])*$",
      "^\\u{61}+$",
      "^[😀-😎]+$",
      "^(\\d|[a-z])+$",
      "^([\\b]|a)+$",
      "^(\\d|\\D)+$",
      "^([^a]|a)+$",
      "^([]|a)+$",
      "^[^]+$",
    ];
    for (const pattern of strictAcceptedPatterns) {
      const candidate = structuredClone(baseTrack);
      candidate.node_types.Task = {
        ...candidate.node_types.Task!,
        attributes: { title: { kind: "string", pattern } },
      };
      expect(validateTemplateAgainstMetamodel(deepFreeze(candidate)).status, `Expected accepted pattern ${pattern}`).toBe(
        "accepted",
      );
    }
  });

  it("R4-MAJOR-01: rejects unknown keys in all 6 nested TrackPrFileProjectionDecl sub-objects", () => {
    const fullTrack = buildCompleteTrackTemplate();

    const mutateTrackSlice = (
      mutator: (slice: Record<string, unknown>) => void,
      expectedPath: string,
    ): void => {
      const candidate = structuredClone(fullTrack);
      mutator(candidate.file_projections!.default_pr_slice as unknown as Record<string, unknown>);
      expectSingleDiagnostic(deepFreeze(candidate), "MM_FILE_SHAPE_PATH_ESCAPE", expectedPath);
    };

    mutateTrackSlice(
      (s) => {
        (s.event_journal as Record<string, unknown>).extra_path = "../../outside";
      },
      "file_projections.default_pr_slice.event_journal.extra_path",
    );
    mutateTrackSlice(
      (s) => {
        ((s.event_journal as Record<string, unknown>).envelope_contract as Record<string, unknown>).extra = 1;
      },
      "file_projections.default_pr_slice.event_journal.envelope_contract.extra",
    );
    mutateTrackSlice(
      (s) => {
        (s.state_snapshot as Record<string, unknown>).extra_path = "../../outside";
      },
      "file_projections.default_pr_slice.state_snapshot.extra_path",
    );
    mutateTrackSlice(
      (s) => {
        (s.head_anchor as Record<string, unknown>).extra_path = "../../outside";
      },
      "file_projections.default_pr_slice.head_anchor.extra_path",
    );
    mutateTrackSlice(
      (s) => {
        (s.owner_table_inputs as Record<string, unknown>).extra = 1;
      },
      "file_projections.default_pr_slice.owner_table_inputs.extra",
    );
    mutateTrackSlice(
      (s) => {
        (s.link_fingerprint_sidecar as Record<string, unknown>).extra_path = "../../outside";
      },
      "file_projections.default_pr_slice.link_fingerprint_sidecar.extra_path",
    );
  });

  it("R4-MINOR-01: rejects malformed linking entries, unknown linking keys, and unsafe pattern flags", () => {
    const baseTrack = buildMinimalTrackTemplate();

    const withLinking = (linking: unknown) => {
      const candidate = structuredClone(baseTrack);
      candidate.node_types.Task = {
        ...candidate.node_types.Task!,
        linking: linking as MetamodelTemplateDocument["node_types"][string]["linking"],
      };
      return deepFreeze(candidate);
    };

    expectSingleDiagnostic(
      withLinking({ patterns: ["(a+)+"] }),
      "MM_NODE_INVALID_IDENTIFIER",
      "node_types.Task.linking.patterns[0]",
    );
    expectSingleDiagnostic(
      withLinking({ detect: [{ pattern: "(a+)+" }] }),
      "MM_NODE_INVALID_IDENTIFIER",
      "node_types.Task.linking.detect[0].pattern",
    );
    expectSingleDiagnostic(
      withLinking({ preset: "gazetteer-exact", extra_unknown: { fn: "./evil.js" } }),
      "MM_NODE_INVALID_IDENTIFIER",
      "node_types.Task.linking.extra_unknown",
    );
    expectSingleDiagnostic(
      withLinking({ patterns: [{ form: "^(a|A)+$", flags: "i" }] }),
      "MM_NODE_INVALID_IDENTIFIER",
      "node_types.Task.linking.patterns[0].flags",
    );
    expectSingleDiagnostic(
      withLinking({ detect: [{ pattern: { form: "^(a|A)+$", flags: "gi" } }] }),
      "MM_NODE_INVALID_IDENTIFIER",
      "node_types.Task.linking.detect[0].pattern.flags",
    );
    expectSingleDiagnostic(
      withLinking({ patterns: [{ form: "^(a|A)+$", flags: "v" }] }),
      "MM_NODE_INVALID_IDENTIFIER",
      "node_types.Task.linking.patterns[0].flags",
    );
    expectSingleDiagnostic(
      withLinking({ patterns: [{ form: "^WI-[0-9]{4}$", extra_key: true }] }),
      "MM_NODE_INVALID_IDENTIFIER",
      "node_types.Task.linking.patterns[0].extra_key",
    );
    expectSingleDiagnostic(
      withLinking({ detect: [{ pattern: { form: "^WI-[0-9]{4}$" }, rogue: true }] }),
      "MM_NODE_INVALID_IDENTIFIER",
      "node_types.Task.linking.detect[0].rogue",
    );
    expectSingleDiagnostic(
      withLinking({ normalize: { builtin: ["case_fold"], extra_opt: true } }),
      "MM_NODE_INVALID_IDENTIFIER",
      "node_types.Task.linking.normalize.extra_opt",
    );

    // Explicit Unicode mode flag "u" is accepted on a safe pattern.
    expect(
      validateTemplateAgainstMetamodel(
        withLinking({
          preset: "gazetteer-exact",
          patterns: [{ form: "^(a|A)+$", flags: "u" }],
          detect: ["lexicon", { pattern: { form: "^WI-[0-9]{4}$", flags: "u", membership: "required" } }],
        }),
      ).status,
    ).toBe("accepted");
  });

  it("R4-MINOR-02: rejects unknown keys in domain_policies, state_machine, hardening, hierarchy, and composed_lineage_pins", () => {
    const fullTrack = buildCompleteTrackTemplate();
    const baseTrack = buildMinimalTrackTemplate();

    const checkDomainExtra = (
      mutator: (dp: Record<string, unknown>) => void,
      expectedPath: string,
    ): void => {
      const candidate = structuredClone(fullTrack);
      mutator(candidate.domain_policies as unknown as Record<string, unknown>);
      expectSingleDiagnostic(deepFreeze(candidate), "MM_DOMAIN_POLICY_INVALID", expectedPath);
    };

    checkDomainExtra((dp) => { dp.extra_policy = true; }, "domain_policies.extra_policy");
    checkDomainExtra((dp) => { (dp.levels as Array<Record<string, unknown>>)[0]!.extra = 1; }, "domain_policies.levels[0].extra");
    checkDomainExtra(
      (dp) => { ((dp.cross_cutting_axes as Record<string, Record<string, unknown>>).control_account!).extra = 1; },
      "domain_policies.cross_cutting_axes.control_account.extra",
    );
    checkDomainExtra((dp) => { (dp.nesting_matrix as Array<Record<string, unknown>>)[0]!.extra = 1; }, "domain_policies.nesting_matrix[0].extra");
    checkDomainExtra((dp) => { (dp.stage_refinements as Array<Record<string, unknown>>)[0]!.extra = 1; }, "domain_policies.stage_refinements[0].extra");
    checkDomainExtra((dp) => { (dp.autonomy_policy as Record<string, unknown>).extra = 1; }, "domain_policies.autonomy_policy.extra");
    checkDomainExtra(
      (dp) => { ((dp.acceptance_gates as Record<string, Record<string, unknown>>).feature_uat!).extra = 1; },
      "domain_policies.acceptance_gates.feature_uat.extra",
    );
    checkDomainExtra(
      (dp) => {
        (((dp.acceptance_gates as Record<string, Record<string, unknown>>).feature_uat!).freshness_anchor_equality as Record<string, unknown>).extra = 1;
      },
      "domain_policies.acceptance_gates.feature_uat.freshness_anchor_equality.extra",
    );
    checkDomainExtra((dp) => { (dp.timeboxes as Array<Record<string, unknown>>)[0]!.extra = 1; }, "domain_policies.timeboxes[0].extra");
    checkDomainExtra((dp) => { (dp.eta_policy as Record<string, unknown>).extra = 1; }, "domain_policies.eta_policy.extra");
    checkDomainExtra((dp) => { (dp.risk_policy as Record<string, unknown>).extra = 1; }, "domain_policies.risk_policy.extra");
    checkDomainExtra(
      (dp) => { ((dp.risk_policy as Record<string, unknown>).severity_bands as Array<Record<string, unknown>>)[0]!.extra = 1; },
      "domain_policies.risk_policy.severity_bands[0].extra",
    );
    checkDomainExtra(
      (dp) => { ((dp.legacy_role_remap as Record<string, Record<string, unknown>>).legacy_wp!).extra = 1; },
      "domain_policies.legacy_role_remap.legacy_wp.extra",
    );
    checkDomainExtra((dp) => { (dp.invariants as Array<Record<string, unknown>>)[0]!.extra = 1; }, "domain_policies.invariants[0].extra");

    // state_machine & transitions[]
    const extraSm = structuredClone(baseTrack);
    (extraSm.node_types.Task!.state_machine as unknown as Record<string, unknown>).extra = true;
    expectSingleDiagnostic(deepFreeze(extraSm), "MM_STATE_INVALID_MACHINE", "node_types.Task.state_machine.extra");

    const extraTr = structuredClone(baseTrack);
    (extraTr.node_types.Task!.state_machine!.transitions[0] as unknown as Record<string, unknown>).extra = true;
    expectSingleDiagnostic(
      deepFreeze(extraTr),
      "MM_STATE_INVALID_MACHINE",
      "node_types.Task.state_machine.transitions[0].extra",
    );

    // hardening & hardening.status_transitions[]
    const extraHardening = {
      ...structuredClone(baseTrack),
      hardening: {
        statuses: ["draft", "verified"],
        default_status: "draft",
        status_transitions: [{ from: ["draft"], to: ["verified"] }],
        extra: true,
      },
    };
    expectSingleDiagnostic(deepFreeze(extraHardening), "MM_STATE_INVALID_MACHINE", "hardening.extra");

    const extraHardeningTr = {
      ...structuredClone(baseTrack),
      hardening: {
        statuses: ["draft", "verified"],
        default_status: "draft",
        status_transitions: [{ from: ["draft"], to: ["verified"], extra: true }],
      },
    };
    expectSingleDiagnostic(
      deepFreeze(extraHardeningTr),
      "MM_STATE_INVALID_MACHINE",
      "hardening.status_transitions[0].extra",
    );

    // relation_types.*.hierarchy
    const extraHierarchy = structuredClone(fullTrack);
    (extraHierarchy.relation_types!.child_of!.hierarchy as unknown as Record<string, unknown>).extra = true;
    expectSingleDiagnostic(deepFreeze(extraHierarchy), "MM_REL_INVALID_HIERARCHY", "relation_types.child_of.hierarchy.extra");

    // composed_lineage_pins[]
    const extraPin = {
      ...structuredClone(baseTrack),
      composed_lineage_pins: [
        {
          importAlias: "archi_v1",
          lineage: "archi" as const,
          templateId: "archi",
          templateVersion: "1.0.0",
          templateDigestSha256: ARCHI_V1_SHA256,
          extra: true,
        },
      ],
    };
    expectSingleDiagnostic(deepFreeze(extraPin), "MM_COMPOSE_FLOATING_VERSION", "composed_lineage_pins[0].extra");
  });
});

describe("round-4 complement: strict lookaround rule (BLOCKER-01) and quantifier-free lookaround acceptance", () => {
  const lookaroundNegativeVectors: ReadonlyArray<{
    readonly id: string;
    readonly pattern: string;
  }> = [
    // Pure nested lookaheads (no quantifier inside lookaround — isolates body.hasLookaround)
    { id: "LA01-nested-positive-lookahead", pattern: "^(?=(?=a)b)b$" },
    { id: "LA02-nested-negative-lookahead", pattern: "^(?!(?!a)b)c$" },
    // Pure nested lookbehinds (no quantifier inside lookaround — isolates body.hasLookaround)
    { id: "LB01-nested-positive-lookbehind", pattern: "^a(?<=(?<=a)a)$" },
    { id: "LB02-nested-negative-lookbehind", pattern: "^a(?<!(?<!b)c)$" },
    // Review BLOCKER-01 nested-lookaround ReDoS reproducers (valid /u, len <= 256)
    {
      id: "LA10-review-nested-positive-lookahead-redos",
      pattern: "^" + "a*(?=".repeat(10) + "b" + ")".repeat(10) + "$",
    },
    {
      id: "LB10-review-nested-positive-lookbehind-redos",
      pattern: "^a+" + "(?<=".repeat(10) + "b" + "a*)".repeat(10) + "$",
    },
    // Pure quantifier inside one lookaround (no nested lookaround — isolates body.hasQuantifier)
    { id: "LQ01-quantifier-in-positive-lookahead", pattern: "^a*(?=a*b)$" },
    { id: "LQ02-quantifier-in-negative-lookahead", pattern: "^(?!a+)b$" },
    { id: "LQ03-quantifier-in-positive-lookbehind", pattern: "^b(?<=a+)$" },
    { id: "LQ04-fixed-quantifier-in-negative-lookbehind", pattern: "^b(?<!a{2})$" },
    { id: "LQ05-optional-quantifier-in-lookahead", pattern: "^(?=a?)b$" },
  ];

  for (const vector of lookaroundNegativeVectors) {
    it(`R4C-BLOCKER-01 ${vector.id}: refuses lookaround pattern with exact code MM_ATTR_INVALID_DECLARATION`, () => {
      const candidate = structuredClone(buildMinimalTrackTemplate());
      candidate.node_types.Task = {
        ...candidate.node_types.Task!,
        attributes: { title: { kind: "string", pattern: vector.pattern } },
      };
      expectSingleDiagnostic(
        deepFreeze(candidate),
        "MM_ATTR_INVALID_DECLARATION",
        "node_types.Task.attributes.title.pattern",
      );
    });
  }

  it("R4C-BLOCKER-01-CALLSITES: emits exact site-specific codes for forbidden lookarounds across axes and linking", () => {
    const baseTrack = buildMinimalTrackTemplate();
    for (const pattern of ["^(?=(?=a)b)b$", "^a*(?=a*b)$"]) {
      const axisDoc = {
        ...structuredClone(baseTrack),
        domain_policies: { cross_cutting_axes: { wbs: { attribute: "wbs_code", pattern } } },
      };
      expectSingleDiagnostic(
        deepFreeze(axisDoc),
        "MM_DOMAIN_POLICY_INVALID",
        "domain_policies.cross_cutting_axes.wbs.pattern",
      );

      const linkPatDoc = structuredClone(baseTrack);
      linkPatDoc.node_types.Task = { ...linkPatDoc.node_types.Task!, linking: { patterns: [{ form: pattern }] } };
      expectSingleDiagnostic(
        deepFreeze(linkPatDoc),
        "MM_NODE_INVALID_IDENTIFIER",
        "node_types.Task.linking.patterns[0].form",
      );

      const linkDetDoc = structuredClone(baseTrack);
      linkDetDoc.node_types.Task = {
        ...linkDetDoc.node_types.Task!,
        linking: { detect: [{ pattern: { form: pattern } }] },
      };
      expectSingleDiagnostic(
        deepFreeze(linkDetDoc),
        "MM_NODE_INVALID_IDENTIFIER",
        "node_types.Task.linking.detect[0].pattern.form",
      );
    }
  });

  it("R4C-SAFE-LOOKAROUNDS: keeps quantifier-free non-nested lookarounds allowed across all four forms", () => {
    const baseTrack = buildMinimalTrackTemplate();
    const safeLookaroundPatterns = [
      "^(?!-)[a-z-]+$",
      "^(?=a)[a-z]+$",
      "^[a-z]+(?<=a)$",
      "^[a-z]+(?<!-)$",
    ];
    for (const pattern of safeLookaroundPatterns) {
      const candidate = structuredClone(baseTrack);
      candidate.node_types.Task = {
        ...candidate.node_types.Task!,
        attributes: { title: { kind: "string", pattern } },
      };
      expect(
        validateTemplateAgainstMetamodel(deepFreeze(candidate)).status,
        `Expected accepted quantifier-free lookaround pattern ${pattern}`,
      ).toBe("accepted");
    }
  });
});
