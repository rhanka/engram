import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  validateCrossLineageComposition,
  type CompositionValidationResult,
} from "../src/metamodel/composition.js";
import type { MetamodelDiagnosticCode } from "../src/metamodel/diagnostics.js";
import {
  AUTHORITY_ORDER,
  AUTHORITY_RANK,
  classifyV1Compatibility,
  diffSemVerDocuments,
  evaluateSemVerGate,
  PRESENTATION_ONLY_RULES,
  WIDENING_RULES,
} from "../src/metamodel/semver-gate.js";
import type {
  MetamodelTemplateDocument,
  MetamodelValidationContext,
  RegisteredTemplateRecord,
} from "../src/metamodel/types.js";
import { validateTemplateAgainstMetamodel } from "../src/metamodel/validate.js";
import type { Sha256Digest } from "../src/metamodel-contracts.js";
import { ARCHI_V1, ARCHI_V1_PIN } from "../src/ontology-guardian/archi-profile.js";
import { composeApplicability, deriveApplicability } from "../src/ontology-guardian/diagnostics.js";
import type { MappingFile } from "../src/ontology-guardian/types.js";
import { bundleProfile, checkProfileCompatibility } from "../src/profile-bundle.js";
import type { OntologyProfile } from "../src/types.js";

/** Independent RFC 8785 JCS serializer (never imports production canonical/digest helpers). */
function jcsStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => (item === undefined ? "null" : jcsStringify(item))).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((key) => obj[key] !== undefined)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${keys.map((key) => `${JSON.stringify(key)}:${jcsStringify(obj[key])}`).join(",")}}`;
}

function independentSemanticProjection(doc: unknown, path: string[] = []): unknown {
  if (Array.isArray(doc)) {
    return doc.map((item, idx) => independentSemanticProjection(item, [...path, String(idx)]));
  }
  if (doc !== null && typeof doc === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(doc as Record<string, unknown>).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))) {
      if (path.length === 0 && (key === "sourcePath" || key === "profile_hash" || key === "presentation" || key === "presentation_hash")) {
        continue;
      }
      if (path.length === 2 && path[0] === "node_types" && key === "visual_encoding") {
        continue;
      }
      out[key] = independentSemanticProjection((doc as Record<string, unknown>)[key], [...path, key]);
    }
    return out;
  }
  return doc;
}

function independentTemplateSha256(doc: MetamodelTemplateDocument): Sha256Digest {
  const bytes = jcsStringify(independentSemanticProjection(doc));
  return `sha256:${createHash("sha256").update(bytes, "utf8").digest("hex")}`;
}

function independentPresentationSha256(doc: MetamodelTemplateDocument): Sha256Digest {
  const nodeVisualEncoding = Object.fromEntries(
    Object.entries(doc.node_types).map(([id, nt]) => [id, nt.visual_encoding ?? null]),
  );
  const bytes = jcsStringify({
    node_visual_encoding: nodeVisualEncoding,
    presentation: doc.presentation ?? null,
  });
  return `sha256:${createHash("sha256").update(bytes, "utf8").digest("hex")}`;
}

function stripSha256Prefix(digest: Sha256Digest): string {
  return digest.slice("sha256:".length);
}

function freezeInput<T>(value: T, seen = new WeakSet<object>()): T {
  if (typeof value !== "object" || value === null) return value;
  if (seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value as Record<string, unknown>)) {
    freezeInput(child, seen);
  }
  return Object.freeze(value);
}

function expectSemVerRefusal(
  candidate: unknown,
  context: MetamodelValidationContext | undefined,
  expectedCode: MetamodelDiagnosticCode,
  expectedPath: string,
): void {
  const res = evaluateSemVerGate(freezeInput(candidate), context);
  expect(res.status).toBe("refused-metamodel-invalid");
  if (res.status === "refused-metamodel-invalid") {
    expect(res.diagnostics.map((d) => ({ code: d.code, path: d.path }))).toEqual([
      { code: expectedCode, path: expectedPath },
    ]);
  }
}

function expectCompositionRefusal(
  candidate: unknown,
  context: MetamodelValidationContext | undefined,
  expectedCode: MetamodelDiagnosticCode,
  expectedPath: string,
): void {
  const res: CompositionValidationResult = validateCrossLineageComposition(freezeInput(candidate), context);
  expect(res.status).toBe("refused-metamodel-invalid");
  if (res.status === "refused-metamodel-invalid") {
    expect(res.diagnostics.map((d) => ({ code: d.code, path: d.path }))).toEqual([
      { code: expectedCode, path: expectedPath },
    ]);
  }
}

const ARCHI_V1_SHA256: Sha256Digest = `sha256:${ARCHI_V1_PIN.contentDigest}`;
const ARCHI_V1_ENTITY_IDS = ARCHI_V1.declaration.entityTypes.map((entity) => entity.id);
const ARCHI_V2_SHA256: Sha256Digest = `sha256:${"2".repeat(64)}`;
const ARCHI_V2_ENTITY_IDS = [...ARCHI_V1_ENTITY_IDS, "capability", "process", "session", "businessObject", "controlPolicy"];

function makeTrackTemplate(): MetamodelTemplateDocument {
  return {
    metamodel_version: "engram.metamodel/v1",
    lineage: "track",
    id: "sentropic.agile-product",
    version: "1.0.0",
    default_language: "en",
    composed_lineage_pins: [],
    node_types: {
      WorkItem: {
        definition: "Trackable product work unit with orthogonal specification and realization state machines.",
        id_prefix: "WI",
        aliases: ["work-item"],
        source_backed: true,
        attributes: {
          title: { kind: "string", required: true, minLength: 3, maxLength: 160 },
          rank: { kind: "integer", required: true, min: 0, max: 3 },
          subkind: { kind: "enum", values: ["standard", "quick-task", "spike"] },
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
              { from: ["in-review"], to: ["verified"], authority: "third-party-reviewer" },
              { from: ["verified"], to: ["acceptance-pending"], authority: "track-control" },
              { from: ["acceptance-pending"], to: ["accepted"], authority: "own-act-human" },
              { from: ["accepted", "verified"], to: ["closed"], authority: "mandated-act" },
            ],
          },
        },
        visual_encoding: {
          shape: "box",
          fill: "solid",
          border: "normal",
          color_hex: "#2B6CB0",
        },
      },
      RiskEntry: {
        definition: "Project risk register entry.",
        id_prefix: "RSK",
        attributes: {
          likelihood: { kind: "integer", required: true, min: 1, max: 5 },
          impact: { kind: "integer", required: true, min: 1, max: 5 },
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
        description: "Hierarchical parent-child containment.",
        source_types: ["WorkItem"],
        target_types: ["WorkItem"],
        cardinality: {
          out: { min: 0, max: 1 },
          in: { min: 0, max: "many" },
        },
      },
      governs_risk: {
        description: "Links a work item to a tracked risk.",
        source_types: ["WorkItem"],
        target_types: ["RiskEntry"],
        cardinality: {
          out: { min: 0, max: "many" },
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
      nesting_matrix: [
        { parent_level: "initiative", parent_modes: ["build", "run"], allowed_child_levels: ["epic"] },
        { parent_level: "epic", parent_modes: ["build"], allowed_child_levels: ["feature"] },
        { parent_level: "feature", parent_modes: ["build"], allowed_child_levels: ["task"] },
      ],
      stage_refinements: [
        { parent_stage: "in-implementation", sub_stages: ["coding", "unit-testing"] },
      ],
      autonomy_policy: {
        actor_classes: ["human", "agent", "conductor"],
        max_autonomous_create_rank: 2,
        max_autonomous_create_level: "feature",
        autonomous_stage_ceiling_by_level: {
          feature: "verified",
          task: "closed",
        },
        mandated_act_operations: ["item.create", "item.reparent"],
        own_act_human_operations: ["acceptance.uat-recorded"],
        overlay_precedence: "tighten-only",
      },
      acceptance_gates: {
        feature_uat: {
          applies_to_levels: ["feature"],
          authority: "own-act-human",
          required_actor_class: "human",
          non_waivable_evidence_kinds: ["verification_run", "uat_receipt"],
          require_all_children_terminal: true,
        },
      },
      timeboxes: [
        {
          applies_to_level: "feature",
          subkind: "standard",
          target_days: 10,
          hard_ceiling_days: 20,
          clock_start_trigger: "in-progress",
          clock_stop_triggers: ["accepted", "closed"],
        },
      ],
      risk_policy: {
        likelihood_scale: [1, 2, 3, 4, 5],
        impact_scale: [1, 2, 3, 4, 5],
        severity_bands: [
          { id: "low", min_score: 1, max_score: 4 },
          { id: "medium", min_score: 5, max_score: 9 },
          { id: "high", min_score: 10, max_score: 16 },
          { id: "critical", min_score: 17, max_score: 25 },
        ],
        categories: ["schedule", "security"],
        responses: ["mitigate", "avoid", "transfer", "accept"],
        max_review_validity_days_by_band: { low: 90, medium: 45, high: 14, critical: 7 },
        external_register_max_age_days: 30,
        sensitivity_impact_floors: { regulated: 4, public: 1 },
      },
      invariants: [
        {
          id: "inv-uat-human-only",
          summary: "Feature acceptance receipts require human owner sign-off.",
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
          aggregates: ["item", "risk"],
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
          relative_path_template: ".track/head.json",
          format: "track-head/v1",
        },
        state_snapshot: {
          relative_path_template: ".track/state.snapshot.json",
          schema: "track.state-snapshot/v1",
          include_collections: ["items", "risks"],
          status_vocabulary: ["on-track", "waiting", "blocked", "done"],
          stage_vocabulary: ["request-recorded", "scoped", "specified", "in-implementation", "verified", "closed"],
          remaining_work_realizations: ["to-do", "in-progress"],
        },
        link_fingerprint_sidecar: {
          relative_path_template: ".track/engram-link.json",
          schema: "engram.track-pr-link-fingerprint/v1",
          hash_algorithm: "sha256-rfc8785",
        },
      },
    },
  };
}

function makeH2aTemplate(trackDigest: Sha256Digest): MetamodelTemplateDocument {
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
      HarnessSkill: {
        definition: "Declared skill runnable inside an agent harness scope.",
        id_prefix: "SKL",
        attributes: {
          skill_id: { kind: "string", required: true },
          target_work_item: { kind: "ref", targetTypes: ["track_agile:WorkItem"] },
        },
      },
    },
    relation_types: {
      runs_in_runtime: {
        source_types: ["HarnessSkill"],
        target_types: ["archi_v1:runtime"],
        cardinality: { out: { min: 1, max: "many" }, in: { min: 0, max: "many" } },
      },
      tracks_work_item: {
        source_types: ["HarnessSkill"],
        target_types: ["track_agile:WorkItem"],
        cardinality: { out: { min: 0, max: "many" }, in: { min: 0, max: "many" } },
      },
    },
  };
}

function makeBridgeTemplate(trackDigest: Sha256Digest): MetamodelTemplateDocument {
  return {
    metamodel_version: "engram.metamodel/v1",
    lineage: "engram",
    id: "track-archi2-bridge",
    version: "1.0.0",
    composed_lineage_pins: [
      {
        importAlias: "archi_v1",
        lineage: "archi",
        templateId: "archi",
        templateVersion: "1.0.0",
        templateDigestSha256: ARCHI_V1_SHA256,
      },
      {
        importAlias: "archi_v2",
        lineage: "archi",
        templateId: "archi",
        templateVersion: "2.0.0",
        templateDigestSha256: ARCHI_V2_SHA256,
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
      BridgeMappingAnchor: {
        definition: "Bridge anchor connecting Track work units to archi@1/archi@2 architecture assets.",
        id_prefix: "BRG",
      },
    },
    relation_types: {
      realizesCapability: {
        description: "Links a Track work item to an archi@2 capability.",
        source_types: ["track_agile:WorkItem"],
        target_types: ["archi_v2:capability"],
      },
      operatesAsset: {
        description: "Links a Track work item to an archi@1 service.",
        source_types: ["track_agile:WorkItem"],
        target_types: ["archi_v1:service"],
      },
    },
  };
}

function makeR3RichBase(): {
  readonly doc: MetamodelTemplateDocument;
  readonly digest: Sha256Digest;
  readonly pin: { readonly id: string; readonly version: string; readonly contentDigest: string };
  readonly registry: readonly RegisteredTemplateRecord[];
} {
  const base = makeTrackTemplate();
  const ap = structuredClone(base.domain_policies!.autonomy_policy!);
  delete ap.max_autonomous_create_level;
  const doc: MetamodelTemplateDocument = {
    ...structuredClone(base),
    id: "sentropic.r3-rich-base",
    composed_lineage_pins: [
      {
        importAlias: "archi_v1",
        lineage: "archi",
        templateId: "archi",
        templateVersion: "1.0.0",
        templateDigestSha256: ARCHI_V1_SHA256,
      },
    ],
    registries: {
      work_items: { source: "work_items", id_column: "id", label_column: "title", node_type: "WorkItem" },
    },
    hardening: {
      statuses: ["draft", "reviewed", "enforced"],
      default_status: "draft",
      promotion_requires: ["peer-review"],
      status_transitions: [{ from_statuses: ["draft"], to_statuses: ["reviewed"], requires: ["spec-check"], authority: "track-control" }],
    },
    node_types: {
      ...structuredClone(base.node_types),
      WorkItem: {
        ...structuredClone(base.node_types.WorkItem!),
        registry: "work_items",
        linking: { preset: "gazetteer-exact", resolve: { mode: "exact" } },
        admission_policy: {
          mode: "promotion-third-party-review",
          third_party_distinct_from_author: true,
          by_rank: { "2": "mandate-gated" },
        },
        attributes: {
          ...structuredClone(base.node_types.WorkItem!.attributes!),
          code: { kind: "string", required: true, minLength: 2, maxLength: 20, pattern: "^[A-Z]+$" },
          tags: { kind: "collection", minItems: 1, maxItems: 5, item: { kind: "ref", targetTypes: ["RiskEntry"] } },
        },
        properties: {
          title: { kind: "string", required: false },
        } as unknown as Record<string, never>,
        state_machines: {
          ...structuredClone(base.node_types.WorkItem!.state_machines!),
          specification: {
            states: ["request-recorded", "scoped", "specified", "withdrawn"],
            initial_state: "request-recorded",
            terminal_states: ["withdrawn"],
            transitions: [
              { from: ["request-recorded"], to: ["scoped"], requires: ["spec-review"], authority: "track-control" },
              { from: ["scoped"], to: ["specified"], authority: "track-control" },
              { from: ["request-recorded", "scoped", "specified"], to: ["withdrawn"], authority: "mandated-act" },
            ],
          },
        },
      },
    },
    relation_types: {
      ...structuredClone(base.relation_types!),
      governs_risk: {
        ...structuredClone(base.relation_types!.governs_risk!),
        requires_evidence: true,
        assertion_basis: ["manual"],
        derivation_methods: ["explicit"],
        cardinality: { out: { min: 0, max: 1 }, in: { min: 0, max: "many" } },
      },
    },
    domain_policies: {
      ...structuredClone(base.domain_policies!),
      cross_cutting_axes: {
        compliance: { attribute: "compliance_tag", pattern: "^SOX-[0-9]+$", inherited_downward: true },
      },
      legacy_role_remap: {
        legacy_story: { target_level: "feature", subkind: "standard", read_only: true },
      },
      stage_refinements: [{ parent_stage: "in-implementation", sub_stages: ["coding"], witness_link_kinds: ["pr"] }],
      autonomy_policy: {
        ...ap,
        autonomous_stage_ceiling_by_level: { feature: "in-review", task: "closed" },
        mandated_act_proof_sources: ["ci-log"],
        overlay_precedence: "tighten-only",
      },
      acceptance_gates: {
        feature_uat: {
          ...structuredClone(base.domain_policies!.acceptance_gates!.feature_uat!),
          applies_to_levels: ["feature", "task"],
        },
      },
      eta_policy: {
        source_kinds: ["measured", "estimate"],
        eligible_ranks: [2, 3],
        max_active_slots_per_item: 2,
        measured_provenance_required_fields: ["sample_count"],
        append_only_slip_journal: true,
        rebaseline_requires_decision: false,
      },
      risk_policy: {
        ...structuredClone(base.domain_policies!.risk_policy!),
        forbid_actor_classes_by_response: { accept: ["agent", "conductor"] },
      },
    },
    file_projections: {
      ...structuredClone(base.file_projections!),
      default_pr_slice: {
        ...structuredClone(base.file_projections!.default_pr_slice!),
        state_snapshot: {
          ...(base.file_projections!.default_pr_slice as { state_snapshot: Record<string, unknown> }).state_snapshot,
          report_sections: ["summary"],
        } as never,
      },
    },
  };
  const digest = independentTemplateSha256(doc);
  const pin = { id: doc.id, version: "1.0.0", contentDigest: stripSha256Prefix(digest) };
  const registry: RegisteredTemplateRecord[] = [
    { lineage: "archi", templateId: "archi", templateVersion: "1.0.0", templateDigestSha256: ARCHI_V1_SHA256, nodeTypeIds: ARCHI_V1_ENTITY_IDS },
    { lineage: "archi", templateId: "archi", templateVersion: "1.2.0", templateDigestSha256: `sha256:${"a".repeat(64)}`, nodeTypeIds: ARCHI_V1_ENTITY_IDS },
    { lineage: "archi", templateId: "archi", templateVersion: "2.0.0", templateDigestSha256: ARCHI_V2_SHA256, nodeTypeIds: ARCHI_V2_ENTITY_IDS },
    {
      lineage: "track",
      templateId: doc.id,
      templateVersion: "1.0.0",
      templateDigestSha256: digest,
      presentationDigest: independentPresentationSha256(doc),
      nodeTypeIds: Object.keys(doc.node_types),
      document: doc,
    },
  ];
  expect(validateTemplateAgainstMetamodel(doc, { registry }).status).toBe("accepted");
  return { doc, digest, pin, registry };
}

function assertLot02DocumentValid(doc: MetamodelTemplateDocument, reg: readonly RegisteredTemplateRecord[], label = doc.id): void {
  const standalone = { ...structuredClone(doc), id: `${doc.id}.lot02_check`, version: "1.0.0", parent_pin: undefined };
  const res = validateTemplateAgainstMetamodel(standalone, { registry: reg });
  expect(res.status, `Lot 0.2 doc validity (${label}): ${res.status === "accepted" ? "" : JSON.stringify(res.diagnostics)}`).toBe("accepted");
}

function registerR3Initial(doc: MetamodelTemplateDocument, extra: readonly RegisteredTemplateRecord[] = []) {
  const res = validateTemplateAgainstMetamodel(doc, { registry: extra });
  expect(res.status, `registerR3Initial (${doc.id}): ${res.status === "accepted" ? "" : JSON.stringify(res.diagnostics)}`).toBe("accepted");
  const digest = independentTemplateSha256(doc);
  const pin = { id: doc.id, version: doc.version, contentDigest: stripSha256Prefix(digest) };
  const reg: RegisteredTemplateRecord[] = [
    ...extra,
    {
      lineage: doc.lineage,
      templateId: doc.id,
      templateVersion: doc.version,
      templateDigestSha256: digest,
      presentationDigest: independentPresentationSha256(doc),
      nodeTypeIds: Object.keys(doc.node_types),
      document: doc,
    },
  ];
  return { digest, pin, reg };
}

describe("metamodel versioning and composition (Lot 0.3)", () => {
  it("the SemVer gate refuses an additive change under a patch bump, a breaking change under a minor bump, an unmapped breaking rename and a duplicate version with another digest, and accepts the matching bumps", () => {
    // 0. Public Lot 0.3 entry point exists
    expect(existsSync(new URL("../src/metamodel/semver-gate.ts", import.meta.url))).toBe(true);

    const base = makeTrackTemplate();
    const baseDigest = independentTemplateSha256(base);
    const basePresentationDigest = independentPresentationSha256(base);
    const parentPin = { id: base.id, version: "1.0.0", contentDigest: stripSha256Prefix(baseDigest) };
    const registry: RegisteredTemplateRecord[] = [
      {
        lineage: "track",
        templateId: base.id,
        templateVersion: "1.0.0",
        templateDigestSha256: baseDigest,
        presentationDigest: basePresentationDigest,
        nodeTypeIds: Object.keys(base.node_types),
        document: base,
      },
      {
        lineage: "archi",
        templateId: "archi",
        templateVersion: "1.0.0",
        templateDigestSha256: ARCHI_V1_SHA256,
        nodeTypeIds: ARCHI_V1_ENTITY_IDS,
      },
    ];

    // 1. profile-bundle CONSUMED_KEYS & MODELED_NODE_KEYS for v1 templates
    const baseBundle = bundleProfile(base as unknown as OntologyProfile);
    expect(baseBundle.ok).toBe(true);
    if (baseBundle.ok) {
      expect(baseBundle.bundle.extensions).toEqual({});
    }

    // 2. Additive changes (one field at a time) under PATCH bump -> MM_VERSION_MINOR_REQUIRED_FOR_ADDITIVE
    const addedStatePatch = structuredClone(base);
    addedStatePatch.version = "1.0.1";
    addedStatePatch.parent_pin = parentPin;
    addedStatePatch.node_types.WorkItem!.state_machines!.specification!.states = [
      "request-recorded",
      "scoped",
      "specified",
      "archived",
      "withdrawn",
    ];
    expectSemVerRefusal(addedStatePatch, { registry }, "MM_VERSION_MINOR_REQUIRED_FOR_ADDITIVE", "version");

    const addedModePatch = structuredClone(base);
    addedModePatch.version = "1.0.1";
    addedModePatch.parent_pin = parentPin;
    addedModePatch.domain_policies!.levels![0]!.modes = ["build", "run", "audit"];
    expectSemVerRefusal(addedModePatch, { registry }, "MM_VERSION_MINOR_REQUIRED_FOR_ADDITIVE", "version");

    const addedPinPatch = structuredClone(base);
    addedPinPatch.version = "1.0.1";
    addedPinPatch.parent_pin = parentPin;
    addedPinPatch.composed_lineage_pins = [
      {
        importAlias: "archi_v1",
        lineage: "archi",
        templateId: "archi",
        templateVersion: "1.0.0",
        templateDigestSha256: ARCHI_V1_SHA256,
      },
    ];
    expectSemVerRefusal(addedPinPatch, { registry }, "MM_VERSION_MINOR_REQUIRED_FOR_ADDITIVE", "version");

    const widenedCardPatch = structuredClone(base);
    widenedCardPatch.version = "1.0.1";
    widenedCardPatch.parent_pin = parentPin;
    widenedCardPatch.relation_types!.child_of!.cardinality = {
      out: { min: 0, max: "many" },
      in: { min: 0, max: "many" },
    };
    expectSemVerRefusal(widenedCardPatch, { registry }, "MM_VERSION_MINOR_REQUIRED_FOR_ADDITIVE", "version");

    const addedOptionalAttrPatch = structuredClone(base);
    addedOptionalAttrPatch.version = "1.0.1";
    addedOptionalAttrPatch.parent_pin = parentPin;
    (addedOptionalAttrPatch.node_types.RiskEntry!.attributes as Record<string, unknown>).notes = {
      kind: "string",
      required: false,
    };
    expectSemVerRefusal(addedOptionalAttrPatch, { registry }, "MM_VERSION_MINOR_REQUIRED_FOR_ADDITIVE", "version");

    const widenedRiskWindowPatch = structuredClone(base);
    widenedRiskWindowPatch.version = "1.0.1";
    widenedRiskWindowPatch.parent_pin = parentPin;
    widenedRiskWindowPatch.domain_policies!.risk_policy!.max_review_validity_days_by_band!.high = 21;
    expectSemVerRefusal(widenedRiskWindowPatch, { registry }, "MM_VERSION_MINOR_REQUIRED_FOR_ADDITIVE", "version");

    const widenedTimeboxPatch = structuredClone(base);
    widenedTimeboxPatch.version = "1.0.1";
    widenedTimeboxPatch.parent_pin = parentPin;
    widenedTimeboxPatch.domain_policies!.timeboxes![0]!.hard_ceiling_days = 30;
    expectSemVerRefusal(widenedTimeboxPatch, { registry }, "MM_VERSION_MINOR_REQUIRED_FOR_ADDITIVE", "version");

    // 3. Same additive changes under MINOR bump -> accepted + profile-bundle compatibility
    const additiveStateMinor = { ...structuredClone(addedStatePatch), version: "1.1.0" };
    const additiveModeMinor = { ...structuredClone(addedModePatch), version: "1.1.0" };
    const additivePinMinor = { ...structuredClone(addedPinPatch), version: "1.1.0" };
    const additiveStateGate = evaluateSemVerGate(freezeInput(additiveStateMinor), { registry });
    expect(additiveStateGate).toMatchObject({ status: "accepted", changeClass: "minor" });
    expect(evaluateSemVerGate(freezeInput(additiveModeMinor), { registry })).toMatchObject({
      status: "accepted",
      changeClass: "minor",
    });
    expect(evaluateSemVerGate(freezeInput(additivePinMinor), { registry })).toMatchObject({
      status: "accepted",
      changeClass: "minor",
    });
    expect(validateTemplateAgainstMetamodel(additiveStateMinor, { registry }).status).toBe("accepted");

    const stateCompat = checkProfileCompatibility(
      base as unknown as OntologyProfile,
      additiveStateMinor as unknown as OntologyProfile,
    );
    expect(stateCompat).toMatchObject({ ok: true, compatible: true, breaking: [] });
    expect(stateCompat.nonBreaking.some((item) => item.code === "changed_unmodeled_block")).toBe(false);

    const modeCompat = checkProfileCompatibility(
      base as unknown as OntologyProfile,
      additiveModeMinor as unknown as OntologyProfile,
    );
    expect(modeCompat).toMatchObject({ ok: true, compatible: true, breaking: [] });

    const optAttrCompat = checkProfileCompatibility(
      base as unknown as OntologyProfile,
      addedOptionalAttrPatch as unknown as OntologyProfile,
    );
    expect(optAttrCompat).toMatchObject({ ok: true, compatible: true, breaking: [] });
    expect(optAttrCompat.nonBreaking.some((d) => d.code === "added_optional_attr" && d.path === "node_types.RiskEntry.attributes.notes")).toBe(true);
    expect(optAttrCompat.nonBreaking.some((d) => d.code === "changed_unmodeled_block")).toBe(false);

    const presObjPatch = structuredClone(base);
    presObjPatch.version = "1.0.1";
    presObjPatch.parent_pin = parentPin;
    presObjPatch.presentation = { display_names: { WorkItem: "Work Item" } };
    const presObjCompat = checkProfileCompatibility(
      base as unknown as OntologyProfile,
      presObjPatch as unknown as OntologyProfile,
    );
    expect(presObjCompat).toMatchObject({ ok: true, compatible: true, breaking: [] });
    expect(presObjCompat.nonBreaking.some((d) => d.code === "changed_presentation" && d.path === "presentation")).toBe(true);
    expect(presObjCompat.nonBreaking.some((d) => d.code === "changed_unmodeled_block")).toBe(false);

    // 4. Breaking changes (one field at a time) under MINOR bump -> MM_VERSION_MAJOR_REQUIRED_FOR_BREAKING
    const tightenedTimebox = structuredClone(base);
    tightenedTimebox.version = "1.1.0";
    tightenedTimebox.parent_pin = parentPin;
    tightenedTimebox.domain_policies!.timeboxes![0]!.hard_ceiling_days = 15;
    expectSemVerRefusal(tightenedTimebox, { registry }, "MM_VERSION_MAJOR_REQUIRED_FOR_BREAKING", "version");
    const tbCompat = checkProfileCompatibility(
      base as unknown as OntologyProfile,
      tightenedTimebox as unknown as OntologyProfile,
    );
    expect(tbCompat.compatible).toBe(false);
    expect(tbCompat.breaking.some((b) => b.code !== "changed_unmodeled_block")).toBe(true);

    const tightenedRiskWindow = structuredClone(base);
    tightenedRiskWindow.version = "1.1.0";
    tightenedRiskWindow.parent_pin = parentPin;
    tightenedRiskWindow.domain_policies!.risk_policy!.max_review_validity_days_by_band!.high = 7;
    expectSemVerRefusal(tightenedRiskWindow, { registry }, "MM_VERSION_MAJOR_REQUIRED_FOR_BREAKING", "version");

    const raisedFloor = structuredClone(base);
    raisedFloor.version = "1.1.0";
    raisedFloor.parent_pin = parentPin;
    raisedFloor.domain_policies!.risk_policy!.sensitivity_impact_floors!.public = 3;
    expectSemVerRefusal(raisedFloor, { registry }, "MM_VERSION_MAJOR_REQUIRED_FOR_BREAKING", "version");

    const tightenedMaxAge = structuredClone(base);
    tightenedMaxAge.version = "1.1.0";
    tightenedMaxAge.parent_pin = parentPin;
    tightenedMaxAge.domain_policies!.risk_policy!.external_register_max_age_days = 15;
    expectSemVerRefusal(tightenedMaxAge, { registry }, "MM_VERSION_MAJOR_REQUIRED_FOR_BREAKING", "version");

    const tightenedCreateRank = structuredClone(base);
    tightenedCreateRank.version = "1.1.0";
    tightenedCreateRank.parent_pin = parentPin;
    tightenedCreateRank.domain_policies!.autonomy_policy!.max_autonomous_create_rank = 1;
    expectSemVerRefusal(tightenedCreateRank, { registry }, "MM_VERSION_MAJOR_REQUIRED_FOR_BREAKING", "version");

    const tightenedStageCeiling = structuredClone(base);
    tightenedStageCeiling.version = "1.1.0";
    tightenedStageCeiling.parent_pin = parentPin;
    tightenedStageCeiling.domain_policies!.autonomy_policy!.autonomous_stage_ceiling_by_level = {
      feature: "in-review",
      task: "closed",
    };
    expectSemVerRefusal(tightenedStageCeiling, { registry }, "MM_VERSION_MAJOR_REQUIRED_FOR_BREAKING", "version");

    const removedLevel = structuredClone(base);
    removedLevel.version = "1.1.0";
    removedLevel.parent_pin = parentPin;
    removedLevel.domain_policies!.levels = removedLevel.domain_policies!.levels!.filter((l) => l.id !== "task");
    expectSemVerRefusal(removedLevel, { registry }, "MM_VERSION_MAJOR_REQUIRED_FOR_BREAKING", "version");

    const removedNesting = structuredClone(base);
    removedNesting.version = "1.1.0";
    removedNesting.parent_pin = parentPin;
    removedNesting.domain_policies!.nesting_matrix = removedNesting.domain_policies!.nesting_matrix!.slice(0, 2);
    expectSemVerRefusal(removedNesting, { registry }, "MM_VERSION_MAJOR_REQUIRED_FOR_BREAKING", "version");

    const removedStageRef = structuredClone(base);
    removedStageRef.version = "1.1.0";
    removedStageRef.parent_pin = parentPin;
    removedStageRef.domain_policies!.stage_refinements = [];
    expectSemVerRefusal(removedStageRef, { registry }, "MM_VERSION_MAJOR_REQUIRED_FOR_BREAKING", "version");

    const alteredProjPath = structuredClone(base);
    alteredProjPath.version = "1.1.0";
    alteredProjPath.parent_pin = parentPin;
    (alteredProjPath.file_projections!.default_pr_slice as { event_journal: { relative_path_template: string } }).event_journal.relative_path_template = ".track/v2/events.jsonl";
    expectSemVerRefusal(alteredProjPath, { registry }, "MM_VERSION_MAJOR_REQUIRED_FOR_BREAKING", "version");

    const tightenedAuthority = structuredClone(base);
    tightenedAuthority.version = "1.1.0";
    tightenedAuthority.parent_pin = parentPin;
    tightenedAuthority.node_types.WorkItem!.state_machines!.specification!.transitions = [
      { from: ["request-recorded"], to: ["scoped"], authority: "mandated-act" },
      { from: ["scoped"], to: ["specified"], authority: "track-control" },
      { from: ["request-recorded", "scoped", "specified"], to: ["withdrawn"], authority: "mandated-act" },
    ];
    expectSemVerRefusal(tightenedAuthority, { registry }, "MM_VERSION_MAJOR_REQUIRED_FOR_BREAKING", "version");
    const authCompat = checkProfileCompatibility(
      base as unknown as OntologyProfile,
      tightenedAuthority as unknown as OntologyProfile,
    );
    expect(authCompat.compatible).toBe(false);
    expect(authCompat.breaking.some((d) => d.code === "tightened_transition_authority")).toBe(true);

    const addedRequiredAttr = structuredClone(base);
    addedRequiredAttr.version = "1.1.0";
    addedRequiredAttr.parent_pin = parentPin;
    (addedRequiredAttr.node_types.RiskEntry!.attributes as Record<string, unknown>).mitigation_owner = {
      kind: "string",
      required: true,
    };
    expectSemVerRefusal(addedRequiredAttr, { registry }, "MM_VERSION_MAJOR_REQUIRED_FOR_BREAKING", "version");
    const reqAttrCompat = checkProfileCompatibility(
      base as unknown as OntologyProfile,
      addedRequiredAttr as unknown as OntologyProfile,
    );
    expect(reqAttrCompat.compatible).toBe(false);
    expect(reqAttrCompat.breaking.some((d) => d.code === "added_required_attr" && d.path === "node_types.RiskEntry.attributes.mitigation_owner")).toBe(true);

    const addedRequiredRelAttr = structuredClone(base);
    addedRequiredRelAttr.version = "1.1.0";
    addedRequiredRelAttr.parent_pin = parentPin;
    (addedRequiredRelAttr.relation_types!.governs_risk as unknown as Record<string, unknown>).attributes = {
      severity_weight: { kind: "integer", required: true },
    };
    expectSemVerRefusal(addedRequiredRelAttr, { registry }, "MM_VERSION_MAJOR_REQUIRED_FOR_BREAKING", "version");
    const relAttrCompat = checkProfileCompatibility(
      base as unknown as OntologyProfile,
      addedRequiredRelAttr as unknown as OntologyProfile,
    );
    expect(relAttrCompat.compatible).toBe(false);
    expect(relAttrCompat.breaking.some((d) => d.code === "added_required_attr" && d.path === "relation_types.governs_risk.attributes.severity_weight")).toBe(true);
    expect(relAttrCompat.breaking.some((d) => d.code === "changed_unmodeled_block")).toBe(false);

    const narrowedEnum = structuredClone(base);
    narrowedEnum.version = "1.1.0";
    narrowedEnum.parent_pin = parentPin;
    (narrowedEnum.node_types.WorkItem!.attributes as Record<string, { values?: string[] }>).subkind = {
      kind: "enum",
      values: ["standard", "quick-task"],
    } as unknown as { values: string[] };
    expectSemVerRefusal(narrowedEnum, { registry }, "MM_VERSION_MAJOR_REQUIRED_FOR_BREAKING", "version");

    // Removing or major-repinning a composed_lineage_pin is breaking
    const pinnedBase = structuredClone(base);
    pinnedBase.composed_lineage_pins = [
      {
        importAlias: "archi_v1",
        lineage: "archi",
        templateId: "archi",
        templateVersion: "1.0.0",
        templateDigestSha256: ARCHI_V1_SHA256,
      },
    ];
    const pinnedBaseDigest = independentTemplateSha256(pinnedBase);
    const pinnedRegistry: RegisteredTemplateRecord[] = [
      {
        lineage: "track",
        templateId: pinnedBase.id,
        templateVersion: "1.0.0",
        templateDigestSha256: pinnedBaseDigest,
        presentationDigest: independentPresentationSha256(pinnedBase),
        document: pinnedBase,
      },
    ];
    const pinnedParentPin = { id: pinnedBase.id, version: "1.0.0", contentDigest: stripSha256Prefix(pinnedBaseDigest) };
    const droppedPin = structuredClone(pinnedBase);
    droppedPin.version = "1.1.0";
    droppedPin.parent_pin = pinnedParentPin;
    droppedPin.composed_lineage_pins = [];
    expectSemVerRefusal(droppedPin, { registry: pinnedRegistry }, "MM_VERSION_MAJOR_REQUIRED_FOR_BREAKING", "version");
    const droppedPinCompat = checkProfileCompatibility(
      pinnedBase as unknown as OntologyProfile,
      droppedPin as unknown as OntologyProfile,
    );
    expect(droppedPinCompat.compatible).toBe(false);
    expect(droppedPinCompat.breaking.some((d) => d.code === "removed_composed_lineage_pin")).toBe(true);

    const majorRepinned = structuredClone(pinnedBase);
    majorRepinned.version = "1.1.0";
    majorRepinned.parent_pin = pinnedParentPin;
    majorRepinned.composed_lineage_pins = [
      {
        importAlias: "archi_v1",
        lineage: "archi",
        templateId: "archi",
        templateVersion: "2.0.0",
        templateDigestSha256: ARCHI_V2_SHA256,
      },
    ];
    expectSemVerRefusal(majorRepinned, { registry: pinnedRegistry }, "MM_VERSION_MAJOR_REQUIRED_FOR_BREAKING", "version");

    // 4b. Breaking change under MAJOR bump -> accepted
    const breakingMajor = { ...structuredClone(tightenedTimebox), version: "2.0.0" };
    expect(evaluateSemVerGate(freezeInput(breakingMajor), { registry })).toMatchObject({
      status: "accepted",
      changeClass: "major",
    });
    expect(validateTemplateAgainstMetamodel(breakingMajor, { registry }).status).toBe("accepted");

    // 5. Breaking rename without MappingFile -> MM_VERSION_UNMAPPED_BREAKING_RENAME; with MappingFile -> accepted
    const renamed = structuredClone(base);
    renamed.version = "2.0.0";
    renamed.parent_pin = parentPin;
    const oldRisk = renamed.node_types.RiskEntry!;
    delete renamed.node_types.RiskEntry;
    renamed.node_types.HazardEntry = { ...oldRisk, aliases: ["RiskEntry"] };
    renamed.relation_types!.governs_risk!.target_types = ["HazardEntry"];

    expectSemVerRefusal(renamed, { registry }, "MM_VERSION_UNMAPPED_BREAKING_RENAME", "mapping_pin");

    const mappingFile: MappingFile = {
      mappingId: "track-risk-to-hazard",
      version: "1.0.0",
      contentDigest: "c".repeat(64),
      entries: [{ kind: "rename", from: "node_types.RiskEntry", to: "node_types.HazardEntry" }],
    };
    const fakePinNoFile = {
      ...structuredClone(renamed),
      mapping_pin: {
        id: mappingFile.mappingId,
        version: mappingFile.version,
        contentDigest: mappingFile.contentDigest,
      },
    };
    expectSemVerRefusal(fakePinNoFile, { registry }, "MM_VERSION_UNMAPPED_BREAKING_RENAME", "mapping_pin");

    const wrongMappingFile: MappingFile = {
      ...mappingFile,
      entries: [{ kind: "rename", from: "node_types.Other", to: "node_types.HazardEntry" }],
    };
    expectSemVerRefusal(
      fakePinNoFile,
      { registry, mappingFile: wrongMappingFile },
      "MM_VERSION_UNMAPPED_BREAKING_RENAME",
      "mapping_pin",
    );

    const mappedRename = fakePinNoFile;
    expect(evaluateSemVerGate(freezeInput(mappedRename), { registry, mappingFile })).toMatchObject({
      status: "accepted",
      changeClass: "major",
    });
    expect(validateTemplateAgainstMetamodel(mappedRename, { registry, mappingFile }).status).toBe("accepted");

    // 6. Presentation-only and doc-only changes under PATCH bump -> accepted
    const presentationPatchBase = structuredClone(base);
    presentationPatchBase.version = "1.0.1";
    presentationPatchBase.parent_pin = parentPin;
    const presentationPatch = structuredClone(presentationPatchBase);
    presentationPatch.node_types.WorkItem!.visual_encoding = {
      shape: "diamond",
      fill: "hollow",
      border: "bold",
      color_hex: "#1A365D",
    };
    const presGate = evaluateSemVerGate(freezeInput(presentationPatch), { registry });
    expect(presGate).toMatchObject({
      status: "accepted",
      changeClass: "patch",
      templateDigestSha256: independentTemplateSha256(presentationPatchBase),
      presentationDigest: independentPresentationSha256(presentationPatch),
    });
    expect(presGate.status === "accepted" ? presGate.presentationDigest : null).not.toBe(basePresentationDigest);
    expect(validateTemplateAgainstMetamodel(presentationPatch, { registry }).status).toBe("accepted");
    const presCompat = checkProfileCompatibility(
      base as unknown as OntologyProfile,
      presentationPatch as unknown as OntologyProfile,
    );
    expect(presCompat).toMatchObject({ ok: true, compatible: true, breaking: [] });

    const docOnlyPatch = structuredClone(base);
    docOnlyPatch.version = "1.0.1";
    docOnlyPatch.parent_pin = parentPin;
    docOnlyPatch.domain_policies!.invariants![0]!.summary = "Updated wording for human UAT owner requirement.";
    expect(evaluateSemVerGate(freezeInput(docOnlyPatch), { registry })).toMatchObject({
      status: "accepted",
      changeClass: "patch",
      diff: { breaking: [], additive: [] },
    });
    const docCompat = checkProfileCompatibility(
      base as unknown as OntologyProfile,
      docOnlyPatch as unknown as OntologyProfile,
    );
    expect(docCompat).toMatchObject({ ok: true, compatible: true, breaking: [] });

    const nodeDefPatch = structuredClone(base);
    nodeDefPatch.version = "1.0.1";
    nodeDefPatch.parent_pin = parentPin;
    nodeDefPatch.node_types.WorkItem!.definition = "Updated human-facing description for work item.";
    expect(evaluateSemVerGate(freezeInput(nodeDefPatch), { registry })).toMatchObject({
      status: "accepted",
      changeClass: "patch",
      diff: { breaking: [], additive: [] },
    });

    // 7. Duplicate version with altered semantic digest (presentation unchanged -> kills M17) -> MM_VERSION_IMMUTABLE_CONFLICT
    const dupSemantic = structuredClone(base);
    dupSemantic.domain_policies!.timeboxes![0]!.hard_ceiling_days = 15;
    expect(independentPresentationSha256(dupSemantic)).toBe(basePresentationDigest);
    expect(independentTemplateSha256(dupSemantic)).not.toBe(baseDigest);
    expectSemVerRefusal(dupSemantic, { registry }, "MM_VERSION_IMMUTABLE_CONFLICT", "version");

    const dupPres = structuredClone(base);
    dupPres.node_types.WorkItem!.visual_encoding = {
      shape: "star",
      fill: "solid",
      border: "normal",
      color_hex: "#2B6CB0",
    };
    expectSemVerRefusal(dupPres, { registry }, "MM_VERSION_IMMUTABLE_CONFLICT", "version");

    expect(evaluateSemVerGate(freezeInput(structuredClone(base)), { registry })).toMatchObject({
      status: "accepted",
      changeClass: "idempotent",
      templateDigestSha256: baseDigest,
      presentationDigest: basePresentationDigest,
    });

    // 8. Non-exact SemVer, missing parent_pin, version regression
    const badSemVer = { ...structuredClone(base), version: "^1.1.0", parent_pin: parentPin };
    expectSemVerRefusal(badSemVer, { registry }, "MM_VERSION_NOT_EXACT_SEMVER", "version");

    const missingParentPin = { ...structuredClone(base), version: "1.1.0" };
    expectSemVerRefusal(missingParentPin, { registry }, "MM_VERSION_PARENT_PIN_MISSING_OR_MISMATCH", "parent_pin");

    const regression = { ...structuredClone(base), version: "0.9.0", parent_pin: parentPin };
    expectSemVerRefusal(regression, { registry }, "MM_VERSION_REGRESSION", "version");

    // 9. Comprehensive guard vectors: initial unmapped rename, doc-less presentationDigest conflict, attribute/record/relation/policy/projection rules
    expectSemVerRefusal(42, { registry }, "MM_SYNTAX_NON_PLAIN_OBJECT", "template");
    expectSemVerRefusal(
      {
        ...structuredClone(base),
        lineage: "engram",
        id: "sentropic.renamed-initial",
        mapping_pin: { id: "initial-rename-map", version: "1.0.0", contentDigest: "d".repeat(64) },
      },
      { registry, declaredRenames: [{ from: "node_types.Old", to: "node_types.WorkItem" }] },
      "MM_VERSION_UNMAPPED_BREAKING_RENAME",
      "mapping_pin",
    );

    const noPresDigestReg: RegisteredTemplateRecord[] = [
      {
        lineage: "track",
        templateId: base.id,
        templateVersion: "1.0.0",
        templateDigestSha256: baseDigest,
        nodeTypeIds: Object.keys(base.node_types),
        document: base,
      },
    ];
    expectSemVerRefusal(dupPres, { registry: noPresDigestReg }, "MM_VERSION_IMMUTABLE_CONFLICT", "version");

    const attrDocOnly = structuredClone(base);
    attrDocOnly.version = "1.0.1";
    attrDocOnly.parent_pin = parentPin;
    (attrDocOnly.node_types.WorkItem!.attributes as Record<string, { description?: string }>).archi_asset_ref!.description = "Updated description.";
    attrDocOnly.relation_types!.governs_risk!.description = "Updated risk link wording.";
    expect(evaluateSemVerGate(freezeInput(attrDocOnly), { registry })).toMatchObject({
      status: "accepted",
      changeClass: "patch",
      diff: { breaking: [], additive: [] },
    });

    const richParent: MetamodelTemplateDocument = {
      ...structuredClone(base),
      id: "sentropic.rich-sem-checks",
      composed_lineage_pins: [
        {
          importAlias: "archi_v1",
          lineage: "archi",
          templateId: "archi",
          templateVersion: "1.0.0",
          templateDigestSha256: ARCHI_V1_SHA256,
        },
      ],
      registries: {
        work_items: { source: "work_items", id_column: "id", label_column: "title", node_type: "WorkItem" },
      },
      hardening: {
        statuses: ["draft", "reviewed", "enforced"],
        default_status: "draft",
        promotion_requires: ["peer-review"],
        status_transitions: [{ from_statuses: ["draft"], to_statuses: ["reviewed"], authority: "author" }],
      },
      node_types: {
        ...structuredClone(base.node_types),
        WorkItem: {
          ...structuredClone(base.node_types.WorkItem!),
          registry: "work_items",
          linking: { preset: "gazetteer-exact", resolve: { mode: "exact" } },
          admission_policy: {
            mode: "promotion-third-party-review",
            third_party_distinct_from_author: false,
            by_rank: { "2": "promotion-third-party-review" },
          },
          attributes: {
            ...structuredClone(base.node_types.WorkItem!.attributes!),
            code: { kind: "string", required: true, minLength: 2, maxLength: 20, pattern: "^[A-Z]+$" },
            tags: { kind: "collection", minItems: 1, maxItems: 5, item: { kind: "ref", targetTypes: ["RiskEntry"] } },
          },
        },
      },
      relation_types: {
        ...structuredClone(base.relation_types!),
        governs_risk: {
          ...structuredClone(base.relation_types!.governs_risk!),
          requires_evidence: false,
          assertion_basis: ["manual"],
          derivation_methods: ["explicit"],
          hierarchy: { id: "work-risk-dag", shape: "dag", parent_role: "source", child_role: "target" },
          attributes: {
            confidence: { kind: "number", min: 0, max: 1 },
          },
        },
      },
      domain_policies: {
        ...structuredClone(base.domain_policies!),
        cross_cutting_axes: {
          compliance: { attribute: "compliance_tag", pattern: "^SOX-[0-9]+$", inherited_downward: true },
        },
        legacy_role_remap: {
          legacy_story: { target_level: "feature", subkind: "standard", read_only: true },
        },
        stage_refinements: [{ parent_stage: "in-implementation", sub_stages: ["coding"], witness_link_kinds: ["pr"] }],
        autonomy_policy: {
          ...structuredClone(base.domain_policies!.autonomy_policy!),
          autonomous_stage_ceiling_by_level: { feature: "in-review", task: "closed" },
          mandated_act_proof_sources: ["ci-log"],
          overlay_precedence: "tighten-only",
        },
        eta_policy: {
          source_kinds: ["measured", "estimate"],
          eligible_ranks: [2, 3],
          max_active_slots_per_item: 2,
          measured_provenance_required_fields: ["sample_count"],
          append_only_slip_journal: true,
          rebaseline_requires_decision: false,
        },
      },
      file_projections: {
        ...structuredClone(base.file_projections!),
      },
    };
    const richDigest = independentTemplateSha256(richParent);
    const richPin = { id: richParent.id, version: "1.0.0", contentDigest: stripSha256Prefix(richDigest) };
    const richReg: RegisteredTemplateRecord[] = [
      {
        lineage: "archi",
        templateId: "archi",
        templateVersion: "1.0.0",
        templateDigestSha256: ARCHI_V1_SHA256,
        nodeTypeIds: ARCHI_V1_ENTITY_IDS,
      },
      {
        lineage: "track",
        templateId: richParent.id,
        templateVersion: "1.0.0",
        templateDigestSha256: richDigest,
        presentationDigest: independentPresentationSha256(richParent),
        nodeTypeIds: Object.keys(richParent.node_types),
        document: richParent,
      },
    ];
    expect(validateTemplateAgainstMetamodel(richParent, { registry: richReg }).status).toBe("accepted");
    const mkRich = (patch: boolean) => ({ ...structuredClone(richParent), version: patch ? "1.0.1" : "1.1.0", parent_pin: richPin });

    // Additive rules verified: patch refused -> minor accepted
    const additiveChecks: Array<(d: MetamodelTemplateDocument) => void> = [
      (d) => { d.node_types.WorkItem!.attributes!.rank!.required = false; },
      (d) => { (d.node_types.WorkItem!.attributes!.code as { maxLength?: number }).maxLength = 40; },
      (d) => { delete (d.node_types.WorkItem!.attributes!.code as { pattern?: string }).pattern; },
      (d) => { (d.node_types.WorkItem!.attributes!.rank as { max?: number }).max = 5; },
      (d) => { (d.node_types.WorkItem!.attributes!.tags as { maxItems?: number }).maxItems = 10; },
      (d) => { ((d.node_types.WorkItem!.attributes!.tags as { item: { targetTypes: string[] } }).item).targetTypes = ["RiskEntry", "WorkItem"]; },
      (d) => { d.node_types.WorkItem!.state_machines!.specification!.transitions![1]!.authority = "author"; },
      (d) => { d.node_types.WorkItem!.admission_policy!.mode = "bounded-auto"; },
      (d) => { delete d.node_types.WorkItem!.admission_policy; },
      (d) => { d.composed_lineage_pins![0]!.templateVersion = "1.2.0"; d.composed_lineage_pins![0]!.templateDigestSha256 = `sha256:${"a".repeat(64)}`; },
      (d) => { d.domain_policies!.levels![1]!.requires_parent = false; },
      (d) => { delete d.domain_policies!.levels![2]!.closure_gate_ref; },
      (d) => { d.domain_policies!.autonomy_policy!.max_autonomous_create_rank = 3; },
      (d) => { d.domain_policies!.autonomy_policy!.max_autonomous_create_level = "task"; },
      (d) => { d.domain_policies!.autonomy_policy!.autonomous_stage_ceiling_by_level!.feature = "verified"; },
      (d) => { d.domain_policies!.autonomy_policy!.autonomous_stage_ceiling_by_level!.epic = "in-review"; },
      (d) => { d.domain_policies!.autonomy_policy!.mandated_act_operations = ["item.create"]; },
      (d) => { d.domain_policies!.autonomy_policy!.mandated_act_proof_sources = ["ci-log", "signed-attestation"]; },
      (d) => { d.domain_policies!.acceptance_gates!.feature_uat!.require_all_children_terminal = false; },
      (d) => { d.domain_policies!.timeboxes![0]!.target_days = 14; },
      (d) => { d.domain_policies!.risk_policy!.external_register_max_age_days = 60; },
      (d) => { d.domain_policies!.risk_policy!.sensitivity_impact_floors!.regulated = 3; },
      (d) => { delete d.domain_policies!.risk_policy!.sensitivity_impact_floors!.public; },
      (d) => { d.domain_policies!.invariants![0]!.severity = "warning"; },
      (d) => { d.domain_policies!.invariants!.push({ id: "inv-2", summary: "Added note.", scope: "risk_policy", severity: "warning" }); },
      (d) => { d.node_types.WorkItem!.aliases = ["work-item", "wi"]; },
      (d) => { d.node_types.WorkItem!.source_backed = false; },
      (d) => { d.hardening!.promotion_requires = []; },
    ];
    for (const mutate of additiveChecks) {
      const p = mkRich(true);
      mutate(p);
      expectSemVerRefusal(p, { registry: richReg }, "MM_VERSION_MINOR_REQUIRED_FOR_ADDITIVE", "version");
      const m = mkRich(false);
      mutate(m);
      expect(evaluateSemVerGate(freezeInput(m), { registry: richReg })).toMatchObject({ status: "accepted", changeClass: "minor" });
    }

    // Breaking rules verified: minor refused -> major accepted
    const breakingChecks: Array<(d: MetamodelTemplateDocument) => void> = [
      (d) => { (d.node_types.WorkItem!.attributes!.archi_asset_ref as { attributes: Record<string, unknown> }).attributes.external_url = { kind: "string", required: true }; },
      (d) => { delete (d.node_types.WorkItem!.attributes!.archi_asset_ref as { attributes: Record<string, unknown> }).attributes.entity_id; },
      (d) => { (d.node_types.WorkItem!.attributes!.code as { pattern?: string }).pattern = "^WI-[0-9]+$"; },
      (d) => { (d.node_types.WorkItem!.attributes!.code as { minLength?: number }).minLength = 4; },
      (d) => { (d.node_types.WorkItem!.attributes!.rank as { min?: number }).min = 1; },
      (d) => { (d.node_types.WorkItem!.attributes!.tags as { minItems?: number }).minItems = 2; },
      (d) => { d.node_types.WorkItem!.state_machines!.specification!.transitions![0]!.requires = ["owner-signoff"]; },
      (d) => { d.node_types.WorkItem!.admission_policy!.mode = "mandate-gated"; },
      (d) => { d.node_types.WorkItem!.admission_policy!.third_party_distinct_from_author = true; },
      (d) => { d.node_types.WorkItem!.admission_policy!.by_rank!["2"] = "mandate-gated"; },
      (d) => { d.composed_lineage_pins![0]!.lineage = "h2a"; },
      (d) => { d.composed_lineage_pins![0]!.templateDigestSha256 = `sha256:${"f".repeat(64)}`; },
      (d) => { d.domain_policies!.levels![0]!.requires_parent = true; },
      (d) => { d.domain_policies!.levels![0]!.rollup = false; },
      (d) => { d.domain_policies!.levels![0]!.closure_gate_ref = "feature_uat"; },
      (d) => { d.domain_policies!.nesting_matrix![0]!.allowed_child_levels = []; },
      (d) => { d.domain_policies!.stage_refinements![0]!.sub_stages = []; },
      (d) => { d.domain_policies!.stage_refinements![0]!.witness_link_kinds = ["pr", "ci"]; },
      (d) => { d.domain_policies!.autonomy_policy!.max_autonomous_create_level = "epic"; },
      (d) => { delete d.domain_policies!.autonomy_policy!.autonomous_stage_ceiling_by_level!.feature; },
      (d) => { d.domain_policies!.autonomy_policy!.mandated_act_operations = ["item.create", "item.reparent", "item.delete"]; },
      (d) => { d.domain_policies!.autonomy_policy!.mandated_act_proof_sources = []; },
      (d) => { d.domain_policies!.autonomy_policy!.overlay_precedence = "allow-widen"; },
      (d) => { d.domain_policies!.acceptance_gates!.feature_uat!.authority = "mandated-act"; },
      (d) => { d.domain_policies!.cross_cutting_axes!.compliance = { attribute: "compliance_tag", pattern: "^SOX-[0-9]+$", inherited_downward: false }; },
      (d) => { d.domain_policies!.timeboxes![0]!.target_days = 5; },
      (d) => { d.domain_policies!.timeboxes![0]!.overdue_escalation = "page-owner"; },
      (d) => { d.domain_policies!.timeboxes![0]!.clock_stop_triggers = ["closed"]; },
      (d) => { (d.domain_policies!.eta_policy as { max_active_slots_per_item: number }).max_active_slots_per_item = 1; },
      (d) => { d.domain_policies!.risk_policy!.severity_bands![0]!.max_score = 3; },
      (d) => { d.domain_policies!.risk_policy!.likelihood_scale = [1, 2, 3]; },
      (d) => { delete d.domain_policies!.risk_policy!.max_review_validity_days_by_band!.low; },
      (d) => { d.domain_policies!.risk_policy!.forbid_actor_classes_by_response = { accept: ["agent"] }; },
      (d) => { d.domain_policies!.invariants![0]!.scope = "risk_policy"; },
      (d) => { d.domain_policies!.invariants = []; },
      (d) => { (d.file_projections!.default_pr_slice as { state_snapshot: { relative_path_template: string } }).state_snapshot.relative_path_template = ".track/v2/state.snapshot.json"; },
      (d) => { d.node_types.WorkItem!.aliases = []; },
      (d) => { d.node_types.WorkItem!.registry = "work_items_v2"; },
      (d) => { d.node_types.WorkItem!.linking = { preset: "hybrid-recall", resolve: { mode: "none" } }; },
      (d) => { d.relation_types!.governs_risk!.requires_evidence = true; },
      (d) => { d.relation_types!.governs_risk!.assertion_basis = []; },
      (d) => { d.relation_types!.governs_risk!.hierarchy = { id: "work-risk-dag", shape: "tree", parent_role: "source", child_role: "target" }; },
      (d) => { (d.relation_types!.governs_risk!.attributes!.confidence as { min: number }).min = 0.5; },
      (d) => { d.hardening!.promotion_requires = ["peer-review", "security-signoff"]; },
      (d) => { (d.hardening!.status_transitions![0] as { authority?: string }).authority = "mandated-act"; },
      (d) => { d.default_language = "fr"; },
    ];
    for (const mutate of breakingChecks) {
      const m = mkRich(false);
      mutate(m);
      expectSemVerRefusal(m, { registry: richReg }, "MM_VERSION_MAJOR_REQUIRED_FOR_BREAKING", "version");
    }
  });

  it("a cross-lineage composition accepts exact pinned versions and refuses a floating version, a wrong digest, a redefined external type and a cycle", () => {
    // 0. Public Lot 0.3 entry point exists
    expect(existsSync(new URL("../src/metamodel/composition.ts", import.meta.url))).toBe(true);
    expectCompositionRefusal(42, undefined, "MM_SYNTAX_NON_PLAIN_OBJECT", "template");

    // G0 D-B7 preserved: inheritance stacking remains non-applicable for TRK, H2A, MEM
    expect(composeApplicability("TRK")[0]?.code).toBe("operation-not-applicable");
    expect(composeApplicability("H2A")[0]?.code).toBe("operation-not-applicable");
    expect(composeApplicability("MEM")[0]?.code).toBe("operation-not-applicable");
    expect(composeApplicability("DIA")).toEqual([]);
    expect(deriveApplicability("TRK")[0]?.code).toBe("operation-not-applicable");

    const track = makeTrackTemplate();
    const trackDigest = independentTemplateSha256(track);
    const registry: RegisteredTemplateRecord[] = [
      {
        lineage: "archi",
        templateId: "archi",
        templateVersion: "1.0.0",
        templateDigestSha256: ARCHI_V1_SHA256,
        nodeTypeIds: ARCHI_V1_ENTITY_IDS,
      },
      {
        lineage: "archi",
        templateId: "archi",
        templateVersion: "2.0.0",
        templateDigestSha256: ARCHI_V2_SHA256,
        nodeTypeIds: ARCHI_V2_ENTITY_IDS,
      },
      {
        lineage: "track",
        templateId: track.id,
        templateVersion: "1.0.0",
        templateDigestSha256: trackDigest,
        nodeTypeIds: Object.keys(track.node_types),
        document: track,
      },
    ];

    // 1. Autonomous track template (composed_lineage_pins: [] with inert ArchiAssetRef) succeeds
    const trackComp = validateCrossLineageComposition(freezeInput(track), { registry });
    expect(trackComp).toMatchObject({ status: "accepted", pins: [], externalEndpoints: [] });
    expect(validateTemplateAgainstMetamodel(track, { registry }).status).toBe("accepted");

    // 2. track-archi2-bridge@1 (lineage: "engram") pinning archi@1, archi@2, and track succeeds
    const bridge = makeBridgeTemplate(trackDigest);
    const bridgeComp = validateCrossLineageComposition(freezeInput(bridge), { registry });
    expect(bridgeComp.status).toBe("accepted");
    if (bridgeComp.status === "accepted") {
      expect(bridgeComp.externalEndpoints).toEqual([
        "archi_v1:service",
        "archi_v2:capability",
        "track_agile:WorkItem",
      ]);
    }
    expect(validateTemplateAgainstMetamodel(bridge, { registry }).status).toBe("accepted");

    // 3. h2a skills template pinning archi@1 and track succeeds
    const h2a = makeH2aTemplate(trackDigest);
    const h2aComp = validateCrossLineageComposition(freezeInput(h2a), { registry });
    expect(h2aComp.status).toBe("accepted");
    if (h2aComp.status === "accepted") {
      expect(h2aComp.externalEndpoints).toEqual([
        "archi_v1:runtime",
        "track_agile:WorkItem",
      ]);
    }
    expect(validateTemplateAgainstMetamodel(h2a, { registry }).status).toBe("accepted");

    // 4. Floating versions ("^1.0.0" and "latest") -> MM_COMPOSE_FLOATING_VERSION
    const pinOnlyH2a: MetamodelTemplateDocument = {
      ...structuredClone(h2a),
      node_types: {
        HarnessSkill: {
          definition: "Declared skill runnable inside an agent harness scope.",
          id_prefix: "SKL",
          attributes: { skill_id: { kind: "string", required: true } },
        },
      },
      relation_types: {},
    };
    for (const floating of ["^1.0.0", "latest"]) {
      const badVersion = structuredClone(pinOnlyH2a);
      badVersion.composed_lineage_pins = [
        { ...badVersion.composed_lineage_pins![0]!, templateVersion: floating },
        badVersion.composed_lineage_pins![1]!,
      ];
      expectCompositionRefusal(
        badVersion,
        { registry },
        "MM_COMPOSE_FLOATING_VERSION",
        "composed_lineage_pins[0].templateVersion",
      );
    }

    // 5. Malformed Sha256Digest -> MM_COMPOSE_INVALID_DIGEST; missing target -> MM_COMPOSE_TARGET_NOT_REGISTERED; wrong digest -> MM_COMPOSE_DIGEST_MISMATCH
    const malformedDigest = structuredClone(pinOnlyH2a);
    malformedDigest.composed_lineage_pins = [
      { ...malformedDigest.composed_lineage_pins![0]!, templateDigestSha256: "not-a-sha256" as Sha256Digest },
      malformedDigest.composed_lineage_pins![1]!,
    ];
    expectCompositionRefusal(
      malformedDigest,
      { registry },
      "MM_COMPOSE_INVALID_DIGEST",
      "composed_lineage_pins[0].templateDigestSha256",
    );

    const unregisteredTarget = structuredClone(pinOnlyH2a);
    unregisteredTarget.composed_lineage_pins = [
      { ...unregisteredTarget.composed_lineage_pins![0]!, templateVersion: "9.9.9" },
      unregisteredTarget.composed_lineage_pins![1]!,
    ];
    expectCompositionRefusal(
      unregisteredTarget,
      { registry },
      "MM_COMPOSE_TARGET_NOT_REGISTERED",
      "composed_lineage_pins[0]",
    );

    const wrongDigest = structuredClone(h2a);
    wrongDigest.composed_lineage_pins = [
      { ...wrongDigest.composed_lineage_pins![0]!, templateDigestSha256: `sha256:${"e".repeat(64)}` },
      wrongDigest.composed_lineage_pins![1]!,
    ];
    expectCompositionRefusal(
      wrongDigest,
      { registry },
      "MM_COMPOSE_DIGEST_MISMATCH",
      "composed_lineage_pins[0].templateDigestSha256",
    );

    // 6. Unknown external type in relation endpoint and ref attribute targetTypes -> MM_COMPOSE_UNKNOWN_EXTERNAL_TYPE
    const unknownEndpointType = structuredClone(h2a);
    unknownEndpointType.relation_types!.runs_in_runtime!.target_types = ["archi_v1:nonexistent_kind"];
    expectCompositionRefusal(
      unknownEndpointType,
      { registry },
      "MM_COMPOSE_UNKNOWN_EXTERNAL_TYPE",
      "relation_types.runs_in_runtime.target_types[0]",
    );

    const unknownRefTargetType = structuredClone(h2a);
    (unknownRefTargetType.node_types.HarnessSkill!.attributes!.target_work_item as { targetTypes: string[] }).targetTypes = [
      "track_agile:MissingType",
    ];
    expectCompositionRefusal(
      unknownRefTargetType,
      { registry },
      "MM_COMPOSE_UNKNOWN_EXTERNAL_TYPE",
      "node_types.HarnessSkill.attributes.target_work_item.targetTypes[0]",
    );

    const nestedCollectionRef = structuredClone(h2a);
    nestedCollectionRef.node_types.HarnessSkill!.attributes!.linked_assets = {
      kind: "collection",
      item: { kind: "ref", targetTypes: ["archi_v1:missing_item_type"] },
    };
    expectCompositionRefusal(
      nestedCollectionRef,
      { registry },
      "MM_COMPOSE_UNKNOWN_EXTERNAL_TYPE",
      "node_types.HarnessSkill.attributes.linked_assets.item.targetTypes[0]",
    );

    const nestedRecordRef = structuredClone(h2a);
    nestedRecordRef.node_types.HarnessSkill!.attributes!.nested_rec = {
      kind: "record",
      attributes: { target: { kind: "ref", targetTypes: ["archi_v1:missing_rec_type"] } },
    };
    expectCompositionRefusal(
      nestedRecordRef,
      { registry },
      "MM_COMPOSE_UNKNOWN_EXTERNAL_TYPE",
      "node_types.HarnessSkill.attributes.nested_rec.attributes.target.targetTypes[0]",
    );

    const relAttrRef = structuredClone(h2a);
    relAttrRef.relation_types!.runs_in_runtime!.attributes = {
      witness: { kind: "ref", targetTypes: ["track_agile:NoSuchNode"] },
    };
    expectCompositionRefusal(
      relAttrRef,
      { registry },
      "MM_COMPOSE_UNKNOWN_EXTERNAL_TYPE",
      "relation_types.runs_in_runtime.attributes.witness.targetTypes[0]",
    );

    const acceptedNestedRefs = structuredClone(h2a);
    acceptedNestedRefs.node_types.HarnessSkill!.attributes!.linked_assets = {
      kind: "collection",
      item: { kind: "ref", targetTypes: ["archi_v1:service"] },
    };
    acceptedNestedRefs.node_types.HarnessSkill!.attributes!.nested_rec = {
      kind: "record",
      attributes: { target: { kind: "ref", targetTypes: ["archi_v1:component"] } },
    };
    acceptedNestedRefs.relation_types!.runs_in_runtime!.attributes = {
      witness: { kind: "ref", targetTypes: ["track_agile:RiskEntry"] },
    };
    expect(validateCrossLineageComposition(freezeInput(acceptedNestedRefs), { registry })).toMatchObject({
      status: "accepted",
      externalEndpoints: ["archi_v1:component", "archi_v1:runtime", "archi_v1:service", "track_agile:RiskEntry", "track_agile:WorkItem"],
    });

    // 7. Redefining, inheriting, or projecting an external type -> MM_COMPOSE_EXTERNAL_TYPE_REDEFINITION
    const redef = structuredClone(h2a);
    redef.node_types["track_agile:WorkItem"] = { definition: "Illegal redefinition." };
    expectCompositionRefusal(
      redef,
      { registry },
      "MM_COMPOSE_EXTERNAL_TYPE_REDEFINITION",
      "node_types.track_agile:WorkItem",
    );

    const nodeInheritsOverride = structuredClone(h2a);
    (nodeInheritsOverride.node_types.HarnessSkill as unknown as Record<string, unknown>).inherits = ["track_agile:WorkItem"];
    expectCompositionRefusal(
      nodeInheritsOverride,
      { registry },
      "MM_COMPOSE_EXTERNAL_TYPE_REDEFINITION",
      "node_types.HarnessSkill.inherits",
    );

    const nodeExtRegistry = structuredClone(h2a);
    nodeExtRegistry.node_types.HarnessSkill!.registry = "archi_v1:runtime";
    expectCompositionRefusal(
      nodeExtRegistry,
      { registry },
      "MM_COMPOSE_EXTERNAL_TYPE_REDEFINITION",
      "node_types.HarnessSkill.registry",
    );

    const regExtTarget = structuredClone(h2a);
    regExtTarget.registries = { ext_reg: { kind: "vocabulary", node_type: "track_agile:WorkItem" } };
    expectCompositionRefusal(
      regExtTarget,
      { registry },
      "MM_COMPOSE_EXTERNAL_TYPE_REDEFINITION",
      "registries.ext_reg.node_type",
    );

    const inheritsOverride = {
      ...structuredClone(h2a),
      extends: ["track_agile:WorkItem"],
    };
    expectCompositionRefusal(inheritsOverride, { registry }, "MM_COMPOSE_EXTERNAL_TYPE_REDEFINITION", "extends");

    const projectedExternal = structuredClone(h2a);
    projectedExternal.file_projections = {
      harness_overlay: {
        kind: "h2a-harness-overlay",
        root_dir: ".h2a",
        relative_path_template: ".h2a/overlays/repo/harness-overlay.json",
        format: "json",
        include_node_types: ["track_agile:WorkItem"],
        order_by: ["entity_id"],
        projected_fields: ["skill_id"],
      },
    };
    expectCompositionRefusal(
      projectedExternal,
      { registry },
      "MM_COMPOSE_EXTERNAL_TYPE_REDEFINITION",
      "file_projections.harness_overlay.include_node_types[0]",
    );

    // 8. Cyclic composition (self-cycle and 2-hop cycle) -> MM_COMPOSE_CYCLE_DETECTED
    const selfCycleTrack = structuredClone(track);
    selfCycleTrack.composed_lineage_pins = [
      {
        importAlias: "self_track",
        lineage: "track",
        templateId: track.id,
        templateVersion: "1.0.0",
        templateDigestSha256: trackDigest,
      },
    ];
    expectCompositionRefusal(selfCycleTrack, { registry }, "MM_COMPOSE_CYCLE_DETECTED", "composed_lineage_pins[0]");

    const cyclePeerDigest: Sha256Digest = `sha256:${"b".repeat(64)}`;
    const cyclicRegistry: RegisteredTemplateRecord[] = [
      ...registry,
      {
        lineage: "engram",
        templateId: "sentropic.cycle-peer",
        templateVersion: "1.0.0",
        templateDigestSha256: cyclePeerDigest,
        nodeTypeIds: ["PeerNode"],
        composedLineagePins: [
          {
            importAlias: "back_to_h2a",
            lineage: "h2a",
            templateId: h2a.id,
            templateVersion: "1.0.0",
            templateDigestSha256: independentTemplateSha256(h2a),
          },
        ],
      },
    ];
    const cyclicH2a: MetamodelTemplateDocument = {
      ...structuredClone(h2a),
      composed_lineage_pins: [
        ...h2a.composed_lineage_pins!,
        {
          importAlias: "peer",
          lineage: "engram",
          templateId: "sentropic.cycle-peer",
          templateVersion: "1.0.0",
          templateDigestSha256: cyclePeerDigest,
        },
      ],
    };
    expectCompositionRefusal(
      cyclicH2a,
      { registry: cyclicRegistry },
      "MM_COMPOSE_CYCLE_DETECTED",
      "composed_lineage_pins[2]",
    );
  });

  describe("round-2 regressions per review finding (M-1..M-7, m-1..m-4)", () => {
    function makeValidBaseContext() {
      const base = makeTrackTemplate();
      const baseDigest = independentTemplateSha256(base);
      const basePres = independentPresentationSha256(base);
      const parentPin = { id: base.id, version: "1.0.0", contentDigest: stripSha256Prefix(baseDigest) };
      const archiReg: RegisteredTemplateRecord = {
        lineage: "archi",
        templateId: "archi",
        templateVersion: "1.0.0",
        templateDigestSha256: ARCHI_V1_SHA256,
        nodeTypeIds: ARCHI_V1_ENTITY_IDS,
      };
      const trackReg: RegisteredTemplateRecord = {
        lineage: "track",
        templateId: base.id,
        templateVersion: "1.0.0",
        templateDigestSha256: baseDigest,
        presentationDigest: basePres,
        nodeTypeIds: Object.keys(base.node_types),
        document: base,
      };
      return { base, baseDigest, parentPin, archiReg, trackReg, registry: [trackReg, archiReg] };
    }

    function registerInitial(doc: MetamodelTemplateDocument, extra: readonly RegisteredTemplateRecord[] = []) {
      const validation = validateTemplateAgainstMetamodel(doc, { registry: extra });
      expect(validation.status).toBe("accepted");
      const digest = independentTemplateSha256(doc);
      const pin = { id: doc.id, version: doc.version, contentDigest: stripSha256Prefix(digest) };
      const reg: RegisteredTemplateRecord[] = [
        ...extra,
        {
          lineage: doc.lineage,
          templateId: doc.id,
          templateVersion: doc.version,
          templateDigestSha256: digest,
          presentationDigest: independentPresentationSha256(doc),
          nodeTypeIds: Object.keys(doc.node_types),
          document: doc,
        },
      ];
      return { digest, pin, reg };
    }

    it("M-1: refuses breaking collection.item kind and required changes under MINOR and reports compatible: false", () => {
      const { base } = makeValidBaseContext();
      const parent = structuredClone(base);
      (parent.node_types.WorkItem!.attributes as Record<string, unknown>).tags = {
        kind: "collection",
        minItems: 1,
        maxItems: 5,
        item: { kind: "string", required: false },
      };
      const { pin, reg } = registerInitial(parent);

      const itemKindMinor = structuredClone(parent);
      itemKindMinor.version = "1.1.0";
      itemKindMinor.parent_pin = pin;
      ((itemKindMinor.node_types.WorkItem!.attributes as Record<string, unknown>).tags as { item: unknown }).item = {
        kind: "integer",
        required: false,
      };
      expect(validateTemplateAgainstMetamodel({ ...structuredClone(itemKindMinor), version: "2.0.0" }, { registry: reg }).status).toBe("accepted");
      expectSemVerRefusal(itemKindMinor, { registry: reg }, "MM_VERSION_MAJOR_REQUIRED_FOR_BREAKING", "version");
      const itemKindMajor = { ...structuredClone(itemKindMinor), version: "2.0.0" };
      expect(evaluateSemVerGate(freezeInput(itemKindMajor), { registry: reg })).toMatchObject({
        status: "accepted",
        changeClass: "major",
        diff: { breaking: ["changed_attr_kind:WorkItem.tags.item"], additive: [] },
      });
      const kindCompat = checkProfileCompatibility(parent as unknown as OntologyProfile, itemKindMinor as unknown as OntologyProfile);
      expect(kindCompat.compatible).toBe(false);
      expect(kindCompat.breaking.map((d) => ({ code: d.code, path: d.path }))).toEqual([
        { code: "changed_attr_kind", path: "node_types.WorkItem.attributes.tags.item" },
      ]);

      const itemReqMinor = structuredClone(parent);
      itemReqMinor.version = "1.1.0";
      itemReqMinor.parent_pin = pin;
      ((itemReqMinor.node_types.WorkItem!.attributes as Record<string, unknown>).tags as { item: { required: boolean } }).item.required = true;
      expect(validateTemplateAgainstMetamodel({ ...structuredClone(itemReqMinor), version: "2.0.0" }, { registry: reg }).status).toBe("accepted");
      expectSemVerRefusal(itemReqMinor, { registry: reg }, "MM_VERSION_MAJOR_REQUIRED_FOR_BREAKING", "version");
      const itemReqMajor = { ...structuredClone(itemReqMinor), version: "2.0.0" };
      expect(evaluateSemVerGate(freezeInput(itemReqMajor), { registry: reg })).toMatchObject({
        status: "accepted",
        changeClass: "major",
        diff: { breaking: ["tightened_attr_required:WorkItem.tags.item"], additive: [] },
      });
      const reqCompat = checkProfileCompatibility(parent as unknown as OntologyProfile, itemReqMinor as unknown as OntologyProfile);
      expect(reqCompat.compatible).toBe(false);
      expect(reqCompat.breaking.map((d) => ({ code: d.code, path: d.path }))).toEqual([
        { code: "tightened_attr_required", path: "node_types.WorkItem.attributes.tags.item" },
      ]);
    });

    it("M-2: deleting a looser admission_policy override tightens to mode and adding a looser override relaxes", () => {
      const { base } = makeValidBaseContext();
      const parent = structuredClone(base);
      parent.node_types.WorkItem!.admission_policy = {
        mode: "own-act-human",
        by_rank: { "3": "bounded-auto" },
        by_operation: { "item.create": "bounded-auto" },
        by_transition: { "realization:to-do->in-progress": "bounded-auto" },
      };
      const { pin, reg } = registerInitial(parent);

      const delRank = structuredClone(parent);
      delRank.version = "1.1.0";
      delRank.parent_pin = pin;
      delete delRank.node_types.WorkItem!.admission_policy!.by_rank!["3"];
      expect(validateTemplateAgainstMetamodel({ ...structuredClone(delRank), version: "2.0.0" }, { registry: reg }).status).toBe("accepted");
      expectSemVerRefusal(delRank, { registry: reg }, "MM_VERSION_MAJOR_REQUIRED_FOR_BREAKING", "version");
      const delRankCompat = checkProfileCompatibility(parent as unknown as OntologyProfile, delRank as unknown as OntologyProfile);
      expect(delRankCompat.compatible).toBe(false);
      expect(delRankCompat.breaking.map((d) => ({ code: d.code, path: d.path }))).toEqual([
        { code: "tightened_admission_by_rank", path: "node_types.WorkItem.admission_policy.by_rank.3" },
      ]);

      const delOp = structuredClone(parent);
      delOp.version = "1.1.0";
      delOp.parent_pin = pin;
      delete delOp.node_types.WorkItem!.admission_policy!.by_operation!["item.create"];
      expectSemVerRefusal(delOp, { registry: reg }, "MM_VERSION_MAJOR_REQUIRED_FOR_BREAKING", "version");

      const delTrans = structuredClone(parent);
      delTrans.version = "1.1.0";
      delTrans.parent_pin = pin;
      delete delTrans.node_types.WorkItem!.admission_policy!.by_transition!["realization:to-do->in-progress"];
      expectSemVerRefusal(delTrans, { registry: reg }, "MM_VERSION_MAJOR_REQUIRED_FOR_BREAKING", "version");

      const addLooserPatch = structuredClone(parent);
      addLooserPatch.version = "1.0.1";
      addLooserPatch.parent_pin = pin;
      addLooserPatch.node_types.WorkItem!.admission_policy!.by_rank!["2"] = "bounded-auto";
      expectSemVerRefusal(addLooserPatch, { registry: reg }, "MM_VERSION_MINOR_REQUIRED_FOR_ADDITIVE", "version");
      const addLooserMinor = { ...structuredClone(addLooserPatch), version: "1.1.0" };
      expect(validateTemplateAgainstMetamodel(addLooserMinor, { registry: reg }).status).toBe("accepted");
      expect(evaluateSemVerGate(freezeInput(addLooserMinor), { registry: reg })).toMatchObject({
        status: "accepted",
        changeClass: "minor",
        diff: { breaking: [], additive: ["relaxed_admission_by_rank:WorkItem.2"] },
      });
      const addLooserCompat = checkProfileCompatibility(parent as unknown as OntologyProfile, addLooserMinor as unknown as OntologyProfile);
      expect(addLooserCompat).toMatchObject({ ok: true, compatible: true, breaking: [] });
      expect(addLooserCompat.nonBreaking.map((d) => ({ code: d.code, path: d.path }))).toEqual([
        { code: "relaxed_admission_by_rank", path: "node_types.WorkItem.admission_policy.by_rank.2" },
        { code: "bumped_profile_version", path: "version" },
      ]);

      const redundantParent = structuredClone(base);
      redundantParent.node_types.WorkItem!.admission_policy = {
        mode: "own-act-human",
        by_rank: { "3": "own-act-human" },
      };
      const redInit = registerInitial(redundantParent);
      const dropRedundant = structuredClone(redundantParent);
      dropRedundant.version = "1.0.1";
      dropRedundant.parent_pin = redInit.pin;
      delete dropRedundant.node_types.WorkItem!.admission_policy!.by_rank!["3"];
      expect(evaluateSemVerGate(freezeInput(dropRedundant), { registry: redInit.reg })).toMatchObject({
        status: "accepted",
        changeClass: "patch",
        diff: { breaking: [], additive: [] },
      });

      const autoParent = structuredClone(base);
      autoParent.node_types.WorkItem!.admission_policy = {
        mode: "bounded-auto",
        by_rank: { "3": "own-act-human" },
      };
      const autoInit = registerInitial(autoParent);
      const addStricter = structuredClone(autoParent);
      addStricter.version = "1.1.0";
      addStricter.parent_pin = autoInit.pin;
      addStricter.node_types.WorkItem!.admission_policy!.by_rank!["2"] = "mandated-act";
      expectSemVerRefusal(addStricter, { registry: autoInit.reg }, "MM_VERSION_MAJOR_REQUIRED_FOR_BREAKING", "version");

      const removeStricterPatch = structuredClone(autoParent);
      removeStricterPatch.version = "1.0.1";
      removeStricterPatch.parent_pin = autoInit.pin;
      delete removeStricterPatch.node_types.WorkItem!.admission_policy!.by_rank!["3"];
      expectSemVerRefusal(removeStricterPatch, { registry: autoInit.reg }, "MM_VERSION_MINOR_REQUIRED_FOR_ADDITIVE", "version");
      expect(evaluateSemVerGate(freezeInput({ ...structuredClone(removeStricterPatch), version: "1.1.0" }), { registry: autoInit.reg })).toMatchObject({
        status: "accepted",
        changeClass: "minor",
        diff: { breaking: [], additive: ["relaxed_admission_by_rank:WorkItem.3"] },
      });
    });

    it("M-3: classifies optional nesting_matrix[].parent_modes transitions in the right direction", () => {
      const { base } = makeValidBaseContext();
      const parent = structuredClone(base);
      parent.domain_policies!.nesting_matrix = [
        { parent_level: "initiative", allowed_child_levels: ["epic"] },
        { parent_level: "epic", parent_modes: ["build"], allowed_child_levels: ["feature"] },
      ];
      const { pin, reg } = registerInitial(parent);

      const narrowMinor = structuredClone(parent);
      narrowMinor.version = "1.1.0";
      narrowMinor.parent_pin = pin;
      narrowMinor.domain_policies!.nesting_matrix![0]!.parent_modes = ["build"];
      expect(validateTemplateAgainstMetamodel({ ...structuredClone(narrowMinor), version: "2.0.0" }, { registry: reg }).status).toBe("accepted");
      expectSemVerRefusal(narrowMinor, { registry: reg }, "MM_VERSION_MAJOR_REQUIRED_FOR_BREAKING", "version");
      const narrowCompat = checkProfileCompatibility(parent as unknown as OntologyProfile, narrowMinor as unknown as OntologyProfile);
      expect(narrowCompat.compatible).toBe(false);
      expect(narrowCompat.breaking.map((d) => ({ code: d.code, path: d.path }))).toEqual([
        { code: "narrowed_nesting_modes", path: "domain_policies.nesting_matrix.parent_modes" },
      ]);

      const widenPatch = structuredClone(parent);
      widenPatch.version = "1.0.1";
      widenPatch.parent_pin = pin;
      delete widenPatch.domain_policies!.nesting_matrix![1]!.parent_modes;
      expectSemVerRefusal(widenPatch, { registry: reg }, "MM_VERSION_MINOR_REQUIRED_FOR_ADDITIVE", "version");
      const widenMinor = { ...structuredClone(widenPatch), version: "1.1.0" };
      expect(validateTemplateAgainstMetamodel(widenMinor, { registry: reg }).status).toBe("accepted");
      expect(evaluateSemVerGate(freezeInput(widenMinor), { registry: reg })).toMatchObject({
        status: "accepted",
        changeClass: "minor",
        diff: { breaking: [], additive: ["widened_nesting_modes:epic"] },
      });
    });

    it("M-4 & Ruling (a): handles undefined max_autonomous_create_rank and fails closed on unmodeled domain_policies or file_projections fields", () => {
      const { base, parentPin, registry } = makeValidBaseContext();
      const noRankParent = structuredClone(base);
      delete noRankParent.domain_policies!.autonomy_policy!.max_autonomous_create_rank;
      const noRankInit = registerInitial(noRankParent);

      const imposeMinor = structuredClone(noRankParent);
      imposeMinor.version = "1.1.0";
      imposeMinor.parent_pin = noRankInit.pin;
      imposeMinor.domain_policies!.autonomy_policy!.max_autonomous_create_rank = 2;
      expect(validateTemplateAgainstMetamodel({ ...structuredClone(imposeMinor), version: "2.0.0" }, { registry: noRankInit.reg }).status).toBe("accepted");
      expectSemVerRefusal(imposeMinor, { registry: noRankInit.reg }, "MM_VERSION_MAJOR_REQUIRED_FOR_BREAKING", "version");
      expect(evaluateSemVerGate(freezeInput({ ...structuredClone(imposeMinor), version: "2.0.0" }), { registry: noRankInit.reg })).toMatchObject({
        status: "accepted",
        changeClass: "major",
        diff: { breaking: ["tightened_max_autonomous_create_rank"], additive: [] },
      });

      const removePatch = structuredClone(base);
      removePatch.version = "1.0.1";
      removePatch.parent_pin = parentPin;
      delete removePatch.domain_policies!.autonomy_policy!.max_autonomous_create_rank;
      expectSemVerRefusal(removePatch, { registry }, "MM_VERSION_MINOR_REQUIRED_FOR_ADDITIVE", "version");
      const removeMinor = { ...structuredClone(removePatch), version: "1.1.0" };
      expect(validateTemplateAgainstMetamodel(removeMinor, { registry }).status).toBe("accepted");
      expect(evaluateSemVerGate(freezeInput(removeMinor), { registry })).toMatchObject({
        status: "accepted",
        changeClass: "minor",
        diff: { breaking: [], additive: ["widened_max_autonomous_create_rank"] },
      });

      for (const ver of ["1.0.1", "1.1.0"] as const) {
        const unknownTop = structuredClone(base);
        unknownTop.version = ver;
        unknownTop.parent_pin = parentPin;
        (unknownTop.domain_policies as Record<string, unknown>).future_ceiling = { strict: true };
        expectSemVerRefusal(unknownTop, { registry }, "MM_VERSION_MAJOR_REQUIRED_FOR_BREAKING", "version");
        if (ver === "1.1.0") {
          expect(evaluateSemVerGate(freezeInput({ ...structuredClone(unknownTop), version: "2.0.0" }), { registry })).toMatchObject({
            status: "accepted",
            changeClass: "major",
            diff: { breaking: ["changed_domain_policies_unmodeled"], additive: [] },
          });
          const unkCompat = checkProfileCompatibility(base as unknown as OntologyProfile, unknownTop as unknown as OntologyProfile);
          expect(unkCompat.compatible).toBe(false);
          expect(unkCompat.breaking.map((d) => ({ code: d.code, path: d.path }))).toEqual([
            { code: "changed_domain_policies_unmodeled", path: "domain_policies" },
          ]);
          expect(unkCompat.nonBreaking.map((d) => ({ code: d.code, path: d.path }))).toEqual([
            { code: "bumped_profile_version", path: "version" },
          ]);
        }

        const unknownNested = structuredClone(base);
        unknownNested.version = ver;
        unknownNested.parent_pin = parentPin;
        (unknownNested.domain_policies!.autonomy_policy as Record<string, unknown>).future_guard = true;
        expectSemVerRefusal(unknownNested, { registry }, "MM_VERSION_MAJOR_REQUIRED_FOR_BREAKING", "version");

        const unknownProj = structuredClone(base);
        unknownProj.version = ver;
        unknownProj.parent_pin = parentPin;
        (unknownProj.file_projections!.default_pr_slice as unknown as Record<string, unknown>).future_contract = "v2";
        expectSemVerRefusal(unknownProj, { registry }, "MM_VERSION_MAJOR_REQUIRED_FOR_BREAKING", "version");
        if (ver === "1.1.0") {
          const projUnkCompat = checkProfileCompatibility(base as unknown as OntologyProfile, unknownProj as unknown as OntologyProfile);
          expect(projUnkCompat.compatible).toBe(false);
          expect(projUnkCompat.breaking.map((d) => ({ code: d.code, path: d.path }))).toEqual([
            { code: "changed_file_projection_unmodeled", path: "file_projections" },
          ]);
        }
      }
    });

    it("M-5: classifies top-level registries removal/binding change as breaking and addition as additive", () => {
      const { base, parentPin, registry } = makeValidBaseContext();
      const parent = structuredClone(base);
      parent.registries = {
        work_items: { source: "work_items", id_column: "id", label_column: "title", node_type: "WorkItem" },
        risk_items: { source: "risk_items", id_column: "id", label_column: "likelihood", node_type: "RiskEntry" },
      };
      const { pin, reg } = registerInitial(parent);

      const removedMinor = structuredClone(parent);
      removedMinor.version = "1.1.0";
      removedMinor.parent_pin = pin;
      delete removedMinor.registries!.risk_items;
      expect(validateTemplateAgainstMetamodel({ ...structuredClone(removedMinor), version: "2.0.0" }, { registry: reg }).status).toBe("accepted");
      expectSemVerRefusal(removedMinor, { registry: reg }, "MM_VERSION_MAJOR_REQUIRED_FOR_BREAKING", "version");
      expect(evaluateSemVerGate(freezeInput({ ...structuredClone(removedMinor), version: "2.0.0" }), { registry: reg })).toMatchObject({
        status: "accepted",
        changeClass: "major",
        diff: { breaking: ["removed_registry:risk_items"], additive: [] },
      });

      const changedBindingMinor = structuredClone(parent);
      changedBindingMinor.version = "1.1.0";
      changedBindingMinor.parent_pin = pin;
      changedBindingMinor.registries!.work_items!.label_column = "rank";
      expect(validateTemplateAgainstMetamodel({ ...structuredClone(changedBindingMinor), version: "2.0.0" }, { registry: reg }).status).toBe("accepted");
      expectSemVerRefusal(changedBindingMinor, { registry: reg }, "MM_VERSION_MAJOR_REQUIRED_FOR_BREAKING", "version");
      expect(evaluateSemVerGate(freezeInput({ ...structuredClone(changedBindingMinor), version: "2.0.0" }), { registry: reg })).toMatchObject({
        status: "accepted",
        changeClass: "major",
        diff: { breaking: ["changed_registry_binding:work_items"], additive: [] },
      });

      const addedPatch = structuredClone(base);
      addedPatch.version = "1.0.1";
      addedPatch.parent_pin = parentPin;
      addedPatch.registries = {
        risk_items: { source: "risk_items", id_column: "id", label_column: "likelihood", node_type: "RiskEntry" },
      };
      expectSemVerRefusal(addedPatch, { registry }, "MM_VERSION_MINOR_REQUIRED_FOR_ADDITIVE", "version");
      const addedMinor = { ...structuredClone(addedPatch), version: "1.1.0" };
      expect(validateTemplateAgainstMetamodel(addedMinor, { registry }).status).toBe("accepted");
      expect(evaluateSemVerGate(freezeInput(addedMinor), { registry })).toMatchObject({
        status: "accepted",
        changeClass: "minor",
        diff: { breaking: [], additive: ["added_registry:risk_items"] },
      });
    });

    it("M-6 & Ruling (b): refuses malformed mapping_pin on upgrades even without renames and avoids duplicate diagnostics", () => {
      const { base, parentPin, registry } = makeValidBaseContext();
      const malformedNoRename = {
        ...structuredClone(base),
        version: "1.1.0",
        parent_pin: parentPin,
        mapping_pin: { bad: true },
      };
      expectSemVerRefusal(malformedNoRename, { registry }, "MM_VERSION_UNMAPPED_BREAKING_RENAME", "mapping_pin");

      const malformedWithRename = structuredClone(base);
      malformedWithRename.version = "2.0.0";
      malformedWithRename.parent_pin = parentPin;
      const oldRisk = malformedWithRename.node_types.RiskEntry!;
      delete malformedWithRename.node_types.RiskEntry;
      malformedWithRename.node_types.HazardEntry = { ...oldRisk, aliases: ["RiskEntry"] };
      malformedWithRename.relation_types!.governs_risk!.target_types = ["HazardEntry"];
      (malformedWithRename as unknown as Record<string, unknown>).mapping_pin = { bad: true };
      expectSemVerRefusal(malformedWithRename, { registry }, "MM_VERSION_UNMAPPED_BREAKING_RENAME", "mapping_pin");
    });

    it("M-7: exercises mapping_pin, state_machine, admission_policy, and relation hierarchy in profile-bundle (kills M33/M35/M36/M38)", () => {
      const { base } = makeValidBaseContext();

      // M33: mapping_pin consumed in V1_CONSUMED_KEYS
      const withMapPin = {
        ...structuredClone(base),
        mapping_pin: { id: "noop-map", version: "1.0.0", contentDigest: "c".repeat(64) },
      };
      const mapPinBundle = bundleProfile(withMapPin as unknown as OntologyProfile);
      expect(mapPinBundle.ok).toBe(true);
      if (mapPinBundle.ok) {
        expect(mapPinBundle.bundle.extensions).toEqual({});
      }
      const mapPinCompat = checkProfileCompatibility(base as unknown as OntologyProfile, withMapPin as unknown as OntologyProfile);
      expect(mapPinCompat).toMatchObject({ ok: true, compatible: true, breaking: [], nonBreaking: [] });

      // M35: state_machine modeled in V1_MODELED_NODE_KEYS
      const riskAddedState = structuredClone(base);
      riskAddedState.node_types.RiskEntry!.state_machine!.states = ["identified", "active", "mitigated", "monitored", "closed"];
      const riskCompat = checkProfileCompatibility(base as unknown as OntologyProfile, riskAddedState as unknown as OntologyProfile);
      expect(riskCompat).toMatchObject({ ok: true, compatible: true, breaking: [] });
      expect(riskCompat.nonBreaking.map((d) => ({ code: d.code, path: d.path }))).toEqual([
        { code: "added_state", path: "node_types.RiskEntry.state_machine.states" },
      ]);

      // M36: admission_policy modeled in V1_MODELED_NODE_KEYS
      const admParent = structuredClone(base);
      admParent.node_types.WorkItem!.admission_policy = { mode: "promotion-third-party-review" };
      const admRelaxed = structuredClone(admParent);
      admRelaxed.node_types.WorkItem!.admission_policy = { mode: "bounded-auto" };
      const admCompat = checkProfileCompatibility(admParent as unknown as OntologyProfile, admRelaxed as unknown as OntologyProfile);
      expect(admCompat).toMatchObject({ ok: true, compatible: true, breaking: [] });
      expect(admCompat.nonBreaking.map((d) => ({ code: d.code, path: d.path }))).toEqual([
        { code: "relaxed_admission_mode", path: "node_types.WorkItem.admission_policy.mode" },
      ]);

      // M38: hierarchy modeled in V1_MODELED_REL_KEYS
      const hierParent = structuredClone(base);
      hierParent.relation_types!.governs_risk!.hierarchy = {
        id: "work-risk-dag",
        shape: "dag",
        parent_role: "source",
        child_role: "target",
      };
      const hierChanged = structuredClone(hierParent);
      hierChanged.relation_types!.governs_risk!.hierarchy = {
        id: "work-risk-dag",
        shape: "tree",
        parent_role: "source",
        child_role: "target",
      };
      const hierCompat = checkProfileCompatibility(hierParent as unknown as OntologyProfile, hierChanged as unknown as OntologyProfile);
      expect(hierCompat.compatible).toBe(false);
      expect(hierCompat.breaking.map((d) => ({ code: d.code, path: d.path }))).toEqual([
        { code: "changed_relation_hierarchy", path: "relation_types.governs_risk.hierarchy" },
      ]);
    });

    it("m-1: emits exact path hardening.status_transitions without duplicate breaking deltas in checkProfileCompatibility", () => {
      const { base } = makeValidBaseContext();
      const hardParent = structuredClone(base);
      hardParent.hardening = {
        statuses: ["draft", "reviewed", "enforced"],
        default_status: "draft",
        promotion_requires: ["peer-review"],
        status_transitions: [{ from_statuses: ["draft"], to_statuses: ["reviewed"], authority: "author" }],
      };
      const { pin, reg } = registerInitial(hardParent);

      const reqTight = structuredClone(hardParent);
      reqTight.version = "1.1.0";
      reqTight.parent_pin = pin;
      reqTight.hardening!.status_transitions = [
        { from_statuses: ["draft"], to_statuses: ["reviewed"], authority: "author", requires: ["ci-pass"] },
      ];
      expectSemVerRefusal(reqTight, { registry: reg }, "MM_VERSION_MAJOR_REQUIRED_FOR_BREAKING", "version");
      const reqCompat = checkProfileCompatibility(hardParent as unknown as OntologyProfile, reqTight as unknown as OntologyProfile);
      expect(reqCompat.compatible).toBe(false);
      expect(reqCompat.breaking.map((d) => ({ code: d.code, path: d.path }))).toEqual([
        { code: "narrowed_status_transition", path: "hardening.status_transitions" },
      ]);

      const authTight = structuredClone(hardParent);
      authTight.version = "1.1.0";
      authTight.parent_pin = pin;
      authTight.hardening!.status_transitions = [
        { from_statuses: ["draft"], to_statuses: ["reviewed"], authority: "mandated-act" },
      ];
      expectSemVerRefusal(authTight, { registry: reg }, "MM_VERSION_MAJOR_REQUIRED_FOR_BREAKING", "version");
      const authCompat = checkProfileCompatibility(hardParent as unknown as OntologyProfile, authTight as unknown as OntologyProfile);
      expect(authCompat.compatible).toBe(false);
      expect(authCompat.breaking.map((d) => ({ code: d.code, path: d.path }))).toEqual([
        { code: "tightened_transition_authority", path: "hardening.status_transitions" },
      ]);
    });

    it("m-2: classifies adding a new severity: error domain invariant as breaking and warning as additive", () => {
      const { base, parentPin, registry } = makeValidBaseContext();
      const errMinor = structuredClone(base);
      errMinor.version = "1.1.0";
      errMinor.parent_pin = parentPin;
      errMinor.domain_policies!.invariants!.push({
        id: "inv-hard-rule",
        summary: "Hard constraint.",
        scope: "risk_policy",
        severity: "error",
      });
      expect(validateTemplateAgainstMetamodel({ ...structuredClone(errMinor), version: "2.0.0" }, { registry }).status).toBe("accepted");
      expectSemVerRefusal(errMinor, { registry }, "MM_VERSION_MAJOR_REQUIRED_FOR_BREAKING", "version");
      expect(evaluateSemVerGate(freezeInput({ ...structuredClone(errMinor), version: "2.0.0" }), { registry })).toMatchObject({
        status: "accepted",
        changeClass: "major",
        diff: { breaking: ["added_error_domain_invariant:inv-hard-rule"], additive: [] },
      });
      const errCompat = checkProfileCompatibility(base as unknown as OntologyProfile, errMinor as unknown as OntologyProfile);
      expect(errCompat.compatible).toBe(false);
      expect(errCompat.breaking.map((d) => ({ code: d.code, path: d.path }))).toEqual([
        { code: "added_error_domain_invariant", path: "domain_policies.invariants.inv-hard-rule" },
      ]);

      const warnPatch = structuredClone(base);
      warnPatch.version = "1.0.1";
      warnPatch.parent_pin = parentPin;
      warnPatch.domain_policies!.invariants!.push({
        id: "inv-soft-note",
        summary: "Advisory note.",
        scope: "risk_policy",
        severity: "warning",
      });
      expectSemVerRefusal(warnPatch, { registry }, "MM_VERSION_MINOR_REQUIRED_FOR_ADDITIVE", "version");
      const warnMinor = { ...structuredClone(warnPatch), version: "1.1.0" };
      expect(validateTemplateAgainstMetamodel(warnMinor, { registry }).status).toBe("accepted");
      expect(evaluateSemVerGate(freezeInput(warnMinor), { registry })).toMatchObject({
        status: "accepted",
        changeClass: "minor",
        diff: { breaking: [], additive: ["added_domain_invariant:inv-soft-note"] },
      });
    });

    it("m-3 & Ruling (c): validates richParent and h2a-harness-overlay fixtures against Lot 0.2", () => {
      const { base, baseDigest, archiReg, trackReg } = makeValidBaseContext();
      const h2aOverlayParent: MetamodelTemplateDocument = {
        ...structuredClone(makeH2aTemplate(baseDigest)),
        file_projections: {
          overlay_view: {
            kind: "h2a-harness-overlay",
            root_dir: ".h2a",
            relative_path_template: ".h2a/overlays/repo/view.json",
            format: "json",
            include_node_types: ["HarnessSkill"],
            order_by: ["entity_id"],
            projected_fields: ["skill_id"],
          },
        },
      };
      const { pin: h2aPin, reg: h2aReg } = registerInitial(h2aOverlayParent, [archiReg, trackReg]);
      const h2aProjMinor = structuredClone(h2aOverlayParent);
      h2aProjMinor.version = "1.1.0";
      h2aProjMinor.parent_pin = h2aPin;
      (h2aProjMinor.file_projections!.overlay_view as { relative_path_template: string }).relative_path_template = ".h2a/overlays/repo/view-v2.json";
      expect(validateTemplateAgainstMetamodel({ ...structuredClone(h2aProjMinor), version: "2.0.0" }, { registry: h2aReg }).status).toBe("accepted");
      expectSemVerRefusal(h2aProjMinor, { registry: h2aReg }, "MM_VERSION_MAJOR_REQUIRED_FOR_BREAKING", "version");
      expect(validateTemplateAgainstMetamodel({ ...structuredClone(base), id: "sentropic.rich-probe" }, { registry: [archiReg] }).status).toBe("accepted");
    });

    it("m-4 & Ruling (d): enforces explicit total order in AUTHORITY_RANK across every adjacent pair and fails closed on omitted/unknown authority", () => {
      expect(AUTHORITY_ORDER).toEqual([
        "author",
        "third-party-reviewer",
        "track-control",
        "h2a-mandate",
        "mandated-act",
        "own-act-human",
      ]);
      expect(AUTHORITY_RANK).toEqual({
        author: 0,
        "third-party-reviewer": 1,
        "track-control": 2,
        "h2a-mandate": 3,
        "mandated-act": 4,
        "own-act-human": 5,
      });

      const { base } = makeValidBaseContext();
      for (let i = 0; i < AUTHORITY_ORDER.length - 1; i += 1) {
        const lowerAuth = AUTHORITY_ORDER[i]!;
        const higherAuth = AUTHORITY_ORDER[i + 1]!;

        const upParent = structuredClone(base);
        upParent.node_types.WorkItem!.state_machines!.specification!.transitions![0]!.authority = lowerAuth;
        const upInit = registerInitial(upParent);
        const upMinor = structuredClone(upParent);
        upMinor.version = "1.1.0";
        upMinor.parent_pin = upInit.pin;
        upMinor.node_types.WorkItem!.state_machines!.specification!.transitions![0]!.authority = higherAuth;
        expectSemVerRefusal(upMinor, { registry: upInit.reg }, "MM_VERSION_MAJOR_REQUIRED_FOR_BREAKING", "version");
        expect(evaluateSemVerGate(freezeInput({ ...structuredClone(upMinor), version: "2.0.0" }), { registry: upInit.reg })).toMatchObject({
          status: "accepted",
          changeClass: "major",
          diff: {
            breaking: ["tightened_transition_authority:WorkItem.specification:request-recorded->scoped"],
            additive: [],
          },
        });
        const upCompat = checkProfileCompatibility(upParent as unknown as OntologyProfile, upMinor as unknown as OntologyProfile);
        expect(upCompat.compatible).toBe(false);
        expect(upCompat.breaking.map((d) => ({ code: d.code, path: d.path }))).toEqual([
          { code: "tightened_transition_authority", path: "node_types.WorkItem.state_machines.specification.transitions" },
        ]);

        const downParent = structuredClone(base);
        downParent.node_types.WorkItem!.state_machines!.specification!.transitions![0]!.authority = higherAuth;
        const downInit = registerInitial(downParent);
        const downPatch = structuredClone(downParent);
        downPatch.version = "1.0.1";
        downPatch.parent_pin = downInit.pin;
        downPatch.node_types.WorkItem!.state_machines!.specification!.transitions![0]!.authority = lowerAuth;
        expectSemVerRefusal(downPatch, { registry: downInit.reg }, "MM_VERSION_MINOR_REQUIRED_FOR_ADDITIVE", "version");
        const downMinor = { ...structuredClone(downPatch), version: "1.1.0" };
        expect(evaluateSemVerGate(freezeInput(downMinor), { registry: downInit.reg })).toMatchObject({
          status: "accepted",
          changeClass: "minor",
          diff: {
            breaking: [],
            additive: ["relaxed_transition_authority:WorkItem.specification:request-recorded->scoped"],
          },
        });
        const downCompat = checkProfileCompatibility(downParent as unknown as OntologyProfile, downMinor as unknown as OntologyProfile);
        expect(downCompat).toMatchObject({ ok: true, compatible: true, breaking: [] });
        expect(downCompat.nonBreaking.map((d) => ({ code: d.code, path: d.path }))).toEqual([
          { code: "relaxed_transition_authority", path: "node_types.WorkItem.state_machines.specification.transitions" },
          { code: "bumped_profile_version", path: "version" },
        ]);
      }

      // Omitted authority fails closed as breaking in both directions (Ruling a)
      const omittedParent = structuredClone(base);
      delete omittedParent.node_types.WorkItem!.state_machines!.specification!.transitions![0]!.authority;
      const omittedInit = registerInitial(omittedParent);
      const setAuthor = structuredClone(omittedParent);
      setAuthor.version = "1.1.0";
      setAuthor.parent_pin = omittedInit.pin;
      setAuthor.node_types.WorkItem!.state_machines!.specification!.transitions![0]!.authority = "author";
      expectSemVerRefusal(setAuthor, { registry: omittedInit.reg }, "MM_VERSION_MAJOR_REQUIRED_FOR_BREAKING", "version");

      const clearAuth = structuredClone(base);
      const clearInit = registerInitial(clearAuth);
      const cleared = structuredClone(clearAuth);
      cleared.version = "1.1.0";
      cleared.parent_pin = clearInit.pin;
      delete cleared.node_types.WorkItem!.state_machines!.specification!.transitions![0]!.authority;
      expectSemVerRefusal(cleared, { registry: clearInit.reg }, "MM_VERSION_MAJOR_REQUIRED_FOR_BREAKING", "version");
    });
  });

  describe("round-3 whole-document diff, data tables, default-breaking, and R2 closures", () => {
    it("M-1 (R2): fails closed as BREAKING for unmodeled root, node_types, properties, relation_types, and state machine keys", () => {
      const ctx = makeR3RichBase();
      const mkCand = (version: string) => ({ ...structuredClone(ctx.doc), version, parent_pin: ctx.pin });

      // Lot-0.2-accepted default-breaking mutations across root, node_types, relation_types
      const lot02Vectors: ReadonlyArray<{
        readonly label: string;
        readonly tag: string;
        readonly bundleCode: string;
        readonly bundlePath: string;
        readonly mutate: (d: MetamodelTemplateDocument) => void;
      }> = [
        {
          label: "unmodeled root key",
          tag: "changed_unmodeled_root:custom_governance",
          bundleCode: "changed_unmodeled_block",
          bundlePath: "extensions.custom_governance",
          mutate: (d) => { (d as unknown as Record<string, unknown>).custom_governance = { quorum: 2 }; },
        },
        {
          label: "node_types.*.properties optional->required tightening (P10)",
          tag: "tightened_attr_required:WorkItem.title",
          bundleCode: "changed_node_property_type",
          bundlePath: "node_types.WorkItem.properties.title",
          mutate: (d) => { ((d.node_types.WorkItem as unknown as { properties: Record<string, Record<string, unknown>> }).properties.title!).required = true; },
        },
        {
          label: "node_types.*.properties added required (P2a)",
          tag: "added_required_attr:WorkItem.extra_req",
          bundleCode: "added_required_attr",
          bundlePath: "node_types.WorkItem.properties.extra_req",
          mutate: (d) => { ((d.node_types.WorkItem as unknown as { properties: Record<string, Record<string, unknown>> }).properties).extra_req = { kind: "string", required: true }; },
        },
        {
          label: "node_types.* unknown key (P2b)",
          tag: "changed_node_unmodeled:WorkItem.custom_rule",
          bundleCode: "changed_unmodeled_block",
          bundlePath: "node_types.WorkItem",
          mutate: (d) => { (d.node_types.WorkItem as unknown as Record<string, unknown>).custom_rule = { strict: true }; },
        },
        {
          label: "relation_types.* unknown key (P3)",
          tag: "changed_relation_unmodeled:governs_risk.custom_constraint",
          bundleCode: "changed_unmodeled_block",
          bundlePath: "relation_types.governs_risk",
          mutate: (d) => { (d.relation_types!.governs_risk as unknown as Record<string, unknown>).custom_constraint = { exclusive: true }; },
        },
      ];

      for (const vec of lot02Vectors) {
        const patchDoc = mkCand("1.0.1");
        vec.mutate(patchDoc);
        expect(validateTemplateAgainstMetamodel(patchDoc, { registry: ctx.registry }).status).toBe("accepted");
        expectSemVerRefusal(patchDoc, { registry: ctx.registry }, "MM_VERSION_MAJOR_REQUIRED_FOR_BREAKING", "version");

        const minorDoc = mkCand("1.1.0");
        vec.mutate(minorDoc);
        expectSemVerRefusal(minorDoc, { registry: ctx.registry }, "MM_VERSION_MAJOR_REQUIRED_FOR_BREAKING", "version");

        const majorDoc = mkCand("2.0.0");
        vec.mutate(majorDoc);
        expect(evaluateSemVerGate(freezeInput(majorDoc), { registry: ctx.registry })).toMatchObject({
          status: "accepted",
          changeClass: "major",
          diff: { breaking: [vec.tag], additive: [], docOnly: [], detectedRenames: [] },
        });

        const compat = checkProfileCompatibility(ctx.doc as unknown as OntologyProfile, majorDoc as unknown as OntologyProfile);
        expect(compat.ok, vec.label).toBe(true);
        expect(compat.compatible, vec.label).toBe(false);
        expect(compat.nonBreaking.map((d) => d.code), vec.label).toEqual(["bumped_profile_version"]);
        expect(compat.breaking.some((b) => b.code === vec.bundleCode && b.path === vec.bundlePath), vec.label).toBe(true);
      }

      // Optional node property addition stays additive (MINOR), not breaking
      const optPropPatch = mkCand("1.0.1");
      (optPropPatch.node_types.WorkItem as unknown as { properties: Record<string, Record<string, unknown>> }).properties.opt_note = { kind: "string", required: false };
      expect(validateTemplateAgainstMetamodel(optPropPatch, { registry: ctx.registry }).status).toBe("accepted");
      expectSemVerRefusal(optPropPatch, { registry: ctx.registry }, "MM_VERSION_MINOR_REQUIRED_FOR_ADDITIVE", "version");
      const optPropMinor = mkCand("1.1.0");
      (optPropMinor.node_types.WorkItem as unknown as { properties: Record<string, Record<string, unknown>> }).properties.opt_note = { kind: "string", required: false };
      expect(evaluateSemVerGate(freezeInput(optPropMinor), { registry: ctx.registry })).toMatchObject({
        status: "accepted",
        changeClass: "minor",
        diff: { breaking: [], additive: ["added_optional_attr:WorkItem.opt_note"], docOnly: [], detectedRenames: [] },
      });

      // Defense-in-depth default-breaking guards (citation_policy, state_machine P12, transition P13, hardening Q3, AttributeDecl R2-26, admission_policy R2-27, unknown by_rank R2-06)
      const defenseVectors: ReadonlyArray<{
        readonly tag: string;
        readonly bundleCode: string | null;
        readonly mutate: (d: MetamodelTemplateDocument) => void;
      }> = [
        {
          tag: "changed_top_level_policy:citation_policy",
          bundleCode: null,
          mutate: (d) => { (d as unknown as Record<string, unknown>).citation_policy = { minimum_granularity: "claim" }; },
        },
        {
          tag: "changed_state_machine:RiskEntry",
          bundleCode: "changed_state_machine",
          mutate: (d) => { (d.node_types.RiskEntry!.state_machine as unknown as Record<string, unknown>).custom_sm_flag = true; },
        },
        {
          tag: "changed_state_machine:WorkItem.specification",
          bundleCode: "changed_state_machine",
          mutate: (d) => { (d.node_types.WorkItem!.state_machines!.specification!.transitions![0] as unknown as Record<string, unknown>).custom_guard = "strict"; },
        },
        {
          tag: "changed_hardening_unmodeled:custom_h",
          bundleCode: "changed_hardening_unmodeled",
          mutate: (d) => { (d.hardening as unknown as Record<string, unknown>).custom_h = 1; },
        },
        {
          tag: "changed_attr_kind:WorkItem.title",
          bundleCode: "changed_attr_kind",
          mutate: (d) => { (d.node_types.WorkItem!.attributes!.title as unknown as Record<string, unknown>).extra_attr_flag = true; },
        },
        {
          tag: "added_invalid_attr:WorkItem.bad_opt",
          bundleCode: "added_invalid_attr",
          mutate: (d) => { (d.node_types.WorkItem!.attributes as Record<string, unknown>).bad_opt = { kind: "string", unknown_attr_key: true }; },
        },
        {
          tag: "changed_admission_policy:WorkItem",
          bundleCode: "changed_admission_policy",
          mutate: (d) => { (d.node_types.WorkItem!.admission_policy as unknown as Record<string, unknown>).unknown_ap_flag = true; },
        },
        {
          tag: "added_invalid_node_type:MilestoneBadAp",
          bundleCode: null,
          mutate: (d) => { (d.node_types as Record<string, unknown>).MilestoneBadAp = { definition: "x", admission_policy: { mode: "bounded-auto", unknown_ap_flag: true } }; },
        },
        {
          tag: "tightened_admission_by_rank:WorkItem.1",
          bundleCode: "tightened_admission_by_rank",
          mutate: (d) => { (d.node_types.WorkItem!.admission_policy!.by_rank as Record<string, string>)["1"] = "unknown-mode"; },
        },
      ];
      for (const vec of defenseVectors) {
        const patchDoc = mkCand("1.0.1");
        vec.mutate(patchDoc);
        expectSemVerRefusal(patchDoc, { registry: ctx.registry }, "MM_VERSION_MAJOR_REQUIRED_FOR_BREAKING", "version");

        const majorDoc = mkCand("2.0.0");
        vec.mutate(majorDoc);
        expect(evaluateSemVerGate(freezeInput(majorDoc), { registry: ctx.registry })).toMatchObject({
          status: "accepted",
          changeClass: "major",
          diff: { breaking: [vec.tag], additive: [], docOnly: [], detectedRenames: [] },
        });
        if (vec.bundleCode !== null) {
          expect(classifyV1Compatibility(ctx.doc as unknown as Record<string, unknown>, majorDoc as unknown as Record<string, unknown>).deltas)
            .toEqual([expect.objectContaining({ kind: "breaking", code: vec.bundleCode })]);
        }
      }
      // Removing an unknown mode in by_rank (parent has it -> candidate omits it) also fails closed as breaking (R2-06 symmetry)
      const badParent = structuredClone(ctx.doc);
      (badParent.node_types.WorkItem!.admission_policy!.by_rank as Record<string, string>)["1"] = "unknown-mode";
      expect(diffSemVerDocuments(badParent as unknown as Record<string, unknown>, mkCand("1.0.1") as unknown as Record<string, unknown>))
        .toMatchObject({ breaking: ["tightened_admission_by_rank:WorkItem.1"], additive: [] });
    });

    it("M-2 (R2): keys nesting_matrix including parent_modes so multi-mode rules never overwrite each other", () => {
      const ctx = makeR3RichBase();
      const singleModeParent = structuredClone(ctx.doc);
      singleModeParent.id = "sentropic.r3-nesting-single";
      singleModeParent.domain_policies!.nesting_matrix = [
        { parent_level: "initiative", parent_modes: ["build", "run"], allowed_child_levels: ["epic"] },
        { parent_level: "epic", parent_modes: ["build"], allowed_child_levels: ["feature"] },
      ];
      const smInit = registerR3Initial(singleModeParent, ctx.registry);

      // Q13: Adding second per-mode rule for the same parent_level on MINOR -> accepted with exact literal delta
      const q13Patch = {
        ...structuredClone(singleModeParent),
        version: "1.0.1",
        parent_pin: smInit.pin,
      };
      q13Patch.domain_policies!.nesting_matrix!.push({ parent_level: "epic", parent_modes: ["run"], allowed_child_levels: ["task"] });
      assertLot02DocumentValid(q13Patch, smInit.reg);
      expectSemVerRefusal(q13Patch, { registry: smInit.reg }, "MM_VERSION_MINOR_REQUIRED_FOR_ADDITIVE", "version");

      const q13Minor = { ...structuredClone(q13Patch), version: "1.1.0" };
      expect(evaluateSemVerGate(freezeInput(q13Minor), { registry: smInit.reg })).toMatchObject({
        status: "accepted",
        changeClass: "minor",
        diff: { breaking: [], additive: ["added_nesting_rule:epic"], docOnly: [], detectedRenames: [] },
      });
      expect(checkProfileCompatibility(singleModeParent as unknown as OntologyProfile, q13Minor as unknown as OntologyProfile).compatible).toBe(true);

      // Two-rule parent for P4a / P4b / parent_modes narrowing
      const multiModeParent = structuredClone(singleModeParent);
      multiModeParent.id = "sentropic.r3-nesting-multi";
      multiModeParent.domain_policies!.nesting_matrix = [
        { parent_level: "initiative", parent_modes: ["build", "run"], allowed_child_levels: ["epic"] },
        { parent_level: "epic", parent_modes: ["build"], allowed_child_levels: ["feature", "task"] },
        { parent_level: "epic", parent_modes: ["run"], allowed_child_levels: ["task"] },
      ];
      const mmInit = registerR3Initial(multiModeParent, ctx.registry);

      // P4a: Deleting rule 0 while rule 1 exists -> breaking
      const p4aPatch = { ...structuredClone(multiModeParent), version: "1.0.1", parent_pin: mmInit.pin };
      p4aPatch.domain_policies!.nesting_matrix!.splice(1, 1);
      assertLot02DocumentValid(p4aPatch, mmInit.reg);
      expectSemVerRefusal(p4aPatch, { registry: mmInit.reg }, "MM_VERSION_MAJOR_REQUIRED_FOR_BREAKING", "version");
      const p4aMajor = { ...structuredClone(p4aPatch), version: "2.0.0" };
      expect(evaluateSemVerGate(freezeInput(p4aMajor), { registry: mmInit.reg })).toMatchObject({
        status: "accepted",
        changeClass: "major",
        diff: { breaking: ["removed_nesting_rule:epic"], additive: [], docOnly: [], detectedRenames: [] },
      });
      expect(checkProfileCompatibility(multiModeParent as unknown as OntologyProfile, p4aMajor as unknown as OntologyProfile).compatible).toBe(false);

      // P4b: Narrowing allowed_child_levels on rule 0 (["feature", "task"] -> ["feature"]) -> breaking
      const p4bPatch = { ...structuredClone(multiModeParent), version: "1.0.1", parent_pin: mmInit.pin };
      p4bPatch.domain_policies!.nesting_matrix![1]!.allowed_child_levels = ["feature"];
      assertLot02DocumentValid(p4bPatch, mmInit.reg);
      expectSemVerRefusal(p4bPatch, { registry: mmInit.reg }, "MM_VERSION_MAJOR_REQUIRED_FOR_BREAKING", "version");
      const p4bMajor = { ...structuredClone(p4bPatch), version: "2.0.0" };
      expect(evaluateSemVerGate(freezeInput(p4bMajor), { registry: mmInit.reg })).toMatchObject({
        status: "accepted",
        changeClass: "major",
        diff: { breaking: ["narrowed_nesting_children:epic"], additive: [], docOnly: [], detectedRenames: [] },
      });

      // Narrowing parent_modes (["build", "run"] -> ["build"]) -> strict single breaking delta, no bogus additive
      const narrowModesPatch = { ...structuredClone(multiModeParent), version: "1.0.1", parent_pin: mmInit.pin };
      narrowModesPatch.domain_policies!.nesting_matrix![0]!.parent_modes = ["build"];
      assertLot02DocumentValid(narrowModesPatch, mmInit.reg);
      expectSemVerRefusal(narrowModesPatch, { registry: mmInit.reg }, "MM_VERSION_MAJOR_REQUIRED_FOR_BREAKING", "version");
      const narrowModesMajor = { ...structuredClone(narrowModesPatch), version: "2.0.0" };
      expect(evaluateSemVerGate(freezeInput(narrowModesMajor), { registry: mmInit.reg })).toMatchObject({
        status: "accepted",
        changeClass: "major",
        diff: { breaking: ["narrowed_nesting_modes:initiative"], additive: [], docOnly: [], detectedRenames: [] },
      });

      // Widening parent_modes (["build"] -> ["build", "run"]) -> strict single additive delta
      const widenModesMinor = { ...structuredClone(singleModeParent), version: "1.1.0", parent_pin: smInit.pin };
      widenModesMinor.domain_policies!.nesting_matrix![1]!.parent_modes = ["build", "run"];
      expect(evaluateSemVerGate(freezeInput(widenModesMinor), { registry: smInit.reg })).toMatchObject({
        status: "accepted",
        changeClass: "minor",
        diff: { breaking: [], additive: ["widened_nesting_modes:epic"], docOnly: [], detectedRenames: [] },
      });
    });

    it("m-1, m-2, m-3 & Rules 5-6: refuses uncomparable values and duplicate array keys cleanly before diffing", () => {
      const ctx = makeR3RichBase();
      const mkCand = (version: string) => ({ ...structuredClone(ctx.doc), version, parent_pin: ctx.pin });

      // m-1 (P9): Missing risk scales refused cleanly (never throws Error: unserializable:undefined, never classified)
      for (const missingKey of ["likelihood_scale", "impact_scale"] as const) {
        const badScale = mkCand("1.0.1");
        delete (badScale.domain_policies!.risk_policy as unknown as Record<string, unknown>)[missingKey];
        const gateRes = evaluateSemVerGate(freezeInput(badScale), { registry: ctx.registry });
        expect(gateRes.status).toBe("refused-metamodel-invalid");
        expect(gateRes.diff).toBeNull();
        expect(gateRes.diagnostics.some((d) => d.code === "MM_DOMAIN_POLICY_INVALID" && d.path === `domain_policies.risk_policy.${missingKey}`)).toBe(true);
        expect(diffSemVerDocuments(ctx.doc as unknown as Record<string, unknown>, badScale as unknown as Record<string, unknown>).refusals?.[0]?.code).toBe("MM_DOMAIN_POLICY_INVALID");
        expect(classifyV1Compatibility(ctx.doc as unknown as Record<string, unknown>, badScale as unknown as Record<string, unknown>).refusals[0]?.code).toBe("MM_DOMAIN_POLICY_INVALID");
        const bundleRes = checkProfileCompatibility(ctx.doc as unknown as OntologyProfile, badScale as unknown as OntologyProfile);
        expect(bundleRes).toMatchObject({ ok: false, compatible: false });
        expect(bundleRes.validationIssues?.some((i) => i.code === "MM_DOMAIN_POLICY_INVALID")).toBe(true);
      }

      // m-3: Non-numeric sensitivity_impact_floors refused cleanly (never classified additive/breaking)
      const nonNumericFloor = mkCand("1.0.1");
      (nonNumericFloor.domain_policies!.risk_policy!.sensitivity_impact_floors as unknown as Record<string, unknown>).regulated = "high";
      expectSemVerRefusal(nonNumericFloor, { registry: ctx.registry }, "MM_DOMAIN_POLICY_INVALID", "domain_policies.risk_policy.sensitivity_impact_floors.regulated");
      expect(checkProfileCompatibility(ctx.doc as unknown as OntologyProfile, nonNumericFloor as unknown as OntologyProfile)).toMatchObject({ ok: false, compatible: false });

      // m-2 (Q1) + Rule 6: Duplicate transitions and duplicate keyed arrays refused before diffing
      const dupSmParent = structuredClone(ctx.doc);
      dupSmParent.node_types.RiskEntry!.state_machine!.transitions!.push({ from: ["identified"], to: ["active"], requires: ["triage"], authority: "track-control" });
      const dupSmCandidate = { ...structuredClone(dupSmParent), version: "1.0.1", parent_pin: { id: dupSmParent.id, version: "1.0.0", contentDigest: stripSha256Prefix(independentTemplateSha256(dupSmParent)) } };
      dupSmCandidate.node_types.RiskEntry!.state_machine!.transitions!.splice(0, 1);
      const q1Diff = diffSemVerDocuments(dupSmParent as unknown as Record<string, unknown>, dupSmCandidate as unknown as Record<string, unknown>);
      expect(q1Diff.refusals?.some((r) => r.code === "MM_STATE_INVALID_MACHINE" && r.path === "node_types.RiskEntry.state_machine.transitions[3]")).toBe(true);
      expect(q1Diff.breaking).toEqual([]);
      expectSemVerRefusal({ ...mkCand("1.0.1"), hardening: { ...ctx.doc.hardening!, status_transitions: [{ from_statuses: ["draft"], to_statuses: ["reviewed"], authority: "author" }, { from_statuses: ["draft"], to_statuses: ["reviewed"], authority: "mandated-act" }] } }, { registry: ctx.registry }, "MM_STATE_INVALID_MACHINE", "hardening.status_transitions[1]");

      // Duplicate keyed array entries in levels, nesting_matrix, timeboxes, invariants, composed_lineage_pins
      const dupLevels = mkCand("1.0.1");
      dupLevels.domain_policies!.levels!.push({ ...dupLevels.domain_policies!.levels![0]! });
      expectSemVerRefusal(dupLevels, { registry: ctx.registry }, "MM_DOMAIN_POLICY_INVALID", "domain_policies.levels[4]");

      const dupNesting = mkCand("1.0.1");
      dupNesting.domain_policies!.nesting_matrix!.push(structuredClone(dupNesting.domain_policies!.nesting_matrix![0]!));
      expectSemVerRefusal(dupNesting, { registry: ctx.registry }, "MM_DOMAIN_POLICY_INVALID", "domain_policies.nesting_matrix[3]");

      const dupTimebox = mkCand("1.0.1");
      dupTimebox.domain_policies!.timeboxes!.push(structuredClone(dupTimebox.domain_policies!.timeboxes![0]!));
      expectSemVerRefusal(dupTimebox, { registry: ctx.registry }, "MM_DOMAIN_POLICY_INVALID", "domain_policies.timeboxes[1]");

      const dupPin = mkCand("1.0.1");
      dupPin.composed_lineage_pins!.push(structuredClone(dupPin.composed_lineage_pins![0]!));
      expectSemVerRefusal(dupPin, { registry: ctx.registry }, "MM_COMPOSE_UNKNOWN_EXTERNAL_TYPE", "composed_lineage_pins[1]");

      // m-3 (R3): Duplicate keyed entries in stage_refinements, severity_bands, invariants + single hardening.default_status bundle delta
      const dupStageRef = mkCand("1.0.1");
      dupStageRef.domain_policies!.stage_refinements!.push(structuredClone(dupStageRef.domain_policies!.stage_refinements![0]!));
      expectSemVerRefusal(dupStageRef, { registry: ctx.registry }, "MM_DOMAIN_POLICY_INVALID", "domain_policies.stage_refinements[1]");

      const dupBand = mkCand("1.0.1");
      dupBand.domain_policies!.risk_policy!.severity_bands!.push(structuredClone(dupBand.domain_policies!.risk_policy!.severity_bands![0]!));
      expectSemVerRefusal(dupBand, { registry: ctx.registry }, "MM_DOMAIN_POLICY_INVALID", "domain_policies.risk_policy.severity_bands[4]");

      const dupInvariant = mkCand("1.0.1");
      dupInvariant.domain_policies!.invariants!.push(structuredClone(dupInvariant.domain_policies!.invariants![0]!));
      expectSemVerRefusal(dupInvariant, { registry: ctx.registry }, "MM_DOMAIN_POLICY_INVALID", "domain_policies.invariants[1]");

      const changedDefaultStatus = mkCand("1.1.0");
      changedDefaultStatus.hardening!.default_status = "reviewed";
      expectSemVerRefusal(changedDefaultStatus, { registry: ctx.registry }, "MM_VERSION_MAJOR_REQUIRED_FOR_BREAKING", "version");
      expect(evaluateSemVerGate(freezeInput({ ...structuredClone(changedDefaultStatus), version: "2.0.0" }), { registry: ctx.registry })).toMatchObject({
        status: "accepted",
        changeClass: "major",
        diff: { breaking: ["changed_hardening_unmodeled:default_status"], additive: [], docOnly: [], detectedRenames: [] },
      });
      const defaultStatusCompat = checkProfileCompatibility(ctx.doc as unknown as OntologyProfile, changedDefaultStatus as unknown as OntologyProfile);
      expect(defaultStatusCompat.compatible).toBe(false);
      expect(defaultStatusCompat.breaking.map((d) => ({ code: d.code, path: d.path }))).toEqual([
        { code: "changed_default_status", path: "hardening.default_status" },
      ]);
    });

    it("M-1 (R3 / Rule 5): classifies projected documents so explicit undefined never reaches canonicalBytes and refuses unserializable or missing required containers", () => {
      const ctx = makeR3RichBase();

      // M09 & P2-03: Lot-0.2-valid parent with explicit undefined property never throws unserializable:undefined
      const undefParent = { ...structuredClone(ctx.doc), parent_pin: undefined } as unknown as MetamodelTemplateDocument;
      (undefParent.node_types.WorkItem!.attributes!.title as Record<string, unknown>).description = undefined;
      expect(validateTemplateAgainstMetamodel(undefParent, { registry: ctx.registry }).status).toBe("accepted");
      const undefInit = registerR3Initial(undefParent, ctx.registry);
      const undefCand = { ...structuredClone(ctx.doc), version: "1.0.1", parent_pin: undefInit.pin };
      expect(evaluateSemVerGate(freezeInput(undefCand), { registry: undefInit.reg })).toMatchObject({
        status: "accepted",
        changeClass: "patch",
        diff: { breaking: [], additive: [], docOnly: [], detectedRenames: [] },
      });
      expect(diffSemVerDocuments(undefParent as unknown as Record<string, unknown>, ctx.doc as unknown as Record<string, unknown>)).toEqual({
        breaking: [],
        additive: [],
        docOnly: [],
        detectedRenames: [],
      });
      expect(diffSemVerDocuments(ctx.doc as unknown as Record<string, unknown>, undefParent as unknown as Record<string, unknown>)).toEqual({
        breaking: [],
        additive: [],
        docOnly: [],
        detectedRenames: [],
      });

      // Unserializable values in direct diff/gate refuse with stable MM_SYNTAX_NON_PLAIN_OBJECT
      const badParent = { ...structuredClone(ctx.doc), custom_unserializable: BigInt(1) };
      expect(diffSemVerDocuments(badParent as unknown as Record<string, unknown>, ctx.doc as unknown as Record<string, unknown>)).toMatchObject({
        breaking: [],
        additive: [],
        docOnly: [],
        refusals: [expect.objectContaining({ code: "MM_SYNTAX_NON_PLAIN_OBJECT", path: "custom_unserializable" })],
      });
      const nanRegInit = [{ ...ctx.registry[3]!, document: { ...structuredClone(ctx.doc), custom_bad: Number.NaN } as unknown as MetamodelTemplateDocument }];
      expectSemVerRefusal({ ...structuredClone(ctx.doc), version: "1.0.1", parent_pin: ctx.pin }, { registry: [...ctx.registry.slice(0, 3), ...nanRegInit] }, "MM_SYNTAX_NON_PLAIN_OBJECT", "custom_bad");
      const exactNanReg = [{ lineage: "track" as const, templateId: ctx.doc.id, templateVersion: ctx.doc.version, templateDigestSha256: ctx.digest, document: { ...structuredClone(ctx.doc), presentation: { bad: Number.NaN } } as unknown as MetamodelTemplateDocument }];
      expectSemVerRefusal(structuredClone(ctx.doc), { registry: exactNanReg }, "MM_SYNTAX_NON_PLAIN_OBJECT", "presentation.bad");

      // M01..M08: 8 deleted required domain_policies / file_projections fields refused cleanly (never throw)
      const trackBase = makeTrackTemplate();
      const trackBaseDigest = independentTemplateSha256(trackBase);
      const h2aOverlayParent: MetamodelTemplateDocument = {
        ...structuredClone(makeH2aTemplate(trackBaseDigest)),
        id: "sentropic.r3-h2a-overlay-m1",
        relation_types: {},
        file_projections: {
          overlay_view: {
            kind: "h2a-harness-overlay",
            root_dir: ".h2a",
            relative_path_template: ".h2a/overlays/repo/view.json",
            format: "json",
            include_node_types: ["HarnessSkill"],
            order_by: ["entity_id"],
            projected_fields: ["skill_id"],
          },
        },
      };
      const h2aInit = registerR3Initial(h2aOverlayParent, [
        ...ctx.registry,
        {
          lineage: "track",
          templateId: trackBase.id,
          templateVersion: trackBase.version,
          templateDigestSha256: trackBaseDigest,
          presentationDigest: independentPresentationSha256(trackBase),
          nodeTypeIds: Object.keys(trackBase.node_types),
          document: trackBase,
        },
      ]);

      const m1Vectors: ReadonlyArray<{
        readonly label: string;
        readonly code: MetamodelDiagnosticCode;
        readonly path: string;
        readonly baseDoc: MetamodelTemplateDocument;
        readonly basePin: { readonly id: string; readonly version: string; readonly contentDigest: string };
        readonly baseReg: readonly RegisteredTemplateRecord[];
        readonly mutate: (d: MetamodelTemplateDocument) => void;
      }> = [
        {
          label: "M01 delete risk_policy.severity_bands",
          code: "MM_DOMAIN_POLICY_INVALID",
          path: "domain_policies.risk_policy.severity_bands",
          baseDoc: ctx.doc,
          basePin: ctx.pin,
          baseReg: ctx.registry,
          mutate: (d) => { delete (d.domain_policies!.risk_policy as unknown as Record<string, unknown>).severity_bands; },
        },
        {
          label: "M02 delete nesting_matrix[0].allowed_child_levels",
          code: "MM_DOMAIN_POLICY_INVALID",
          path: "domain_policies.nesting_matrix[0].allowed_child_levels",
          baseDoc: ctx.doc,
          basePin: ctx.pin,
          baseReg: ctx.registry,
          mutate: (d) => { delete (d.domain_policies!.nesting_matrix![0] as unknown as Record<string, unknown>).allowed_child_levels; },
        },
        {
          label: "M03 delete stage_refinements[0].sub_stages",
          code: "MM_DOMAIN_POLICY_INVALID",
          path: "domain_policies.stage_refinements[0].sub_stages",
          baseDoc: ctx.doc,
          basePin: ctx.pin,
          baseReg: ctx.registry,
          mutate: (d) => { delete (d.domain_policies!.stage_refinements![0] as unknown as Record<string, unknown>).sub_stages; },
        },
        {
          label: "M04 delete default_pr_slice.event_journal",
          code: "MM_FILE_SHAPE_INCOMPLETE_D29_PAIR",
          path: "file_projections.default_pr_slice.event_journal",
          baseDoc: ctx.doc,
          basePin: ctx.pin,
          baseReg: ctx.registry,
          mutate: (d) => { delete (d.file_projections!.default_pr_slice as unknown as Record<string, unknown>).event_journal; },
        },
        {
          label: "M05 delete default_pr_slice.state_snapshot",
          code: "MM_FILE_SHAPE_INCOMPLETE_D29_PAIR",
          path: "file_projections.default_pr_slice.state_snapshot",
          baseDoc: ctx.doc,
          basePin: ctx.pin,
          baseReg: ctx.registry,
          mutate: (d) => { delete (d.file_projections!.default_pr_slice as unknown as Record<string, unknown>).state_snapshot; },
        },
        {
          label: "M06 delete event_journal.aggregates",
          code: "MM_FILE_SHAPE_INCOMPLETE_D29_PAIR",
          path: "file_projections.default_pr_slice.event_journal.aggregates",
          baseDoc: ctx.doc,
          basePin: ctx.pin,
          baseReg: ctx.registry,
          mutate: (d) => { delete ((d.file_projections!.default_pr_slice as { event_journal: Record<string, unknown> }).event_journal).aggregates; },
        },
        {
          label: "M07 delete state_snapshot.include_collections",
          code: "MM_FILE_SHAPE_INCOMPLETE_D29_PAIR",
          path: "file_projections.default_pr_slice.state_snapshot.include_collections",
          baseDoc: ctx.doc,
          basePin: ctx.pin,
          baseReg: ctx.registry,
          mutate: (d) => { delete ((d.file_projections!.default_pr_slice as { state_snapshot: Record<string, unknown> }).state_snapshot).include_collections; },
        },
        {
          label: "M08 delete overlay_view.include_node_types",
          code: "MM_FILE_SHAPE_LINEAGE_FORBIDDEN",
          path: "file_projections.overlay_view.include_node_types",
          baseDoc: h2aOverlayParent,
          basePin: h2aInit.pin,
          baseReg: h2aInit.reg,
          mutate: (d) => { delete (d.file_projections!.overlay_view as unknown as Record<string, unknown>).include_node_types; },
        },
      ];

      for (const vec of m1Vectors) {
        const cand = { ...structuredClone(vec.baseDoc), version: "1.1.0", parent_pin: vec.basePin };
        vec.mutate(cand);
        expectSemVerRefusal(cand, { registry: vec.baseReg }, vec.code, vec.path);
        const diffRes = diffSemVerDocuments(vec.baseDoc as unknown as Record<string, unknown>, cand as unknown as Record<string, unknown>);
        expect(diffRes.breaking, vec.label).toEqual([]);
        expect(diffRes.additive, vec.label).toEqual([]);
        expect(diffRes.refusals?.map((r) => ({ code: r.code, path: r.path })), vec.label).toEqual([{ code: vec.code, path: vec.path }]);
        expect(classifyV1Compatibility(vec.baseDoc as unknown as Record<string, unknown>, cand as unknown as Record<string, unknown>).refusals.map((r) => ({ code: r.code, path: r.path })), vec.label).toEqual([{ code: vec.code, path: vec.path }]);
        const compat = checkProfileCompatibility(vec.baseDoc as unknown as OntologyProfile, cand as unknown as OntologyProfile);
        expect(compat.ok, vec.label).toBe(false);
        expect(compat.compatible, vec.label).toBe(false);
        expect(compat.validationIssues.map((i) => ({ code: i.code, path: i.path })), vec.label).toEqual([{ code: vec.code, path: vec.path }]);
      }
    });

    it("M-2 (R3 / Rule 5): refuses non-boolean and non-array inputs with stable codes, never coerced or classified ADDITIVE", () => {
      const ctx = makeR3RichBase();
      const noEtaParent = structuredClone(ctx.doc);
      noEtaParent.id = "sentropic.r3-no-eta-parent";
      delete noEtaParent.domain_policies!.eta_policy;
      const noEtaInit = registerR3Initial(noEtaParent, ctx.registry);

      const gateFalseParent = structuredClone(ctx.doc);
      gateFalseParent.id = "sentropic.r3-gate-false-parent";
      gateFalseParent.domain_policies!.acceptance_gates!.feature_uat!.require_all_children_terminal = false;
      const gateFalseInit = registerR3Initial(gateFalseParent, ctx.registry);

      const m2Vectors: ReadonlyArray<{
        readonly label: string;
        readonly lot02Accepted?: boolean;
        readonly code: MetamodelDiagnosticCode;
        readonly path: string;
        readonly baseDoc: MetamodelTemplateDocument;
        readonly basePin: { readonly id: string; readonly version: string; readonly contentDigest: string };
        readonly baseReg: readonly RegisteredTemplateRecord[];
        readonly checkCompat?: boolean;
        readonly mutate: (d: MetamodelTemplateDocument) => void;
      }> = [
        {
          label: "M14 acceptance_gates.feature_uat.require_all_children_terminal = null (Lot-0.2-accepted)",
          lot02Accepted: true,
          code: "MM_DOMAIN_POLICY_INVALID",
          path: "domain_policies.acceptance_gates.feature_uat.require_all_children_terminal",
          baseDoc: ctx.doc,
          basePin: ctx.pin,
          baseReg: ctx.registry,
          checkCompat: true,
          mutate: (d) => { (d.domain_policies!.acceptance_gates!.feature_uat as unknown as Record<string, unknown>).require_all_children_terminal = null; },
        },
        {
          label: "P2-02 acceptance_gates.feature_uat.require_all_children_terminal = 'false' (Lot-0.2-accepted)",
          lot02Accepted: true,
          code: "MM_DOMAIN_POLICY_INVALID",
          path: "domain_policies.acceptance_gates.feature_uat.require_all_children_terminal",
          baseDoc: gateFalseParent,
          basePin: gateFalseInit.pin,
          baseReg: gateFalseInit.reg,
          checkCompat: true,
          mutate: (d) => { (d.domain_policies!.acceptance_gates!.feature_uat as unknown as Record<string, unknown>).require_all_children_terminal = "false"; },
        },
        {
          label: "P2-01 added eta_policy with measured_provenance_required_fields = 'not-an-array' (Lot-0.2-accepted)",
          lot02Accepted: true,
          code: "MM_DOMAIN_POLICY_INVALID",
          path: "domain_policies.eta_policy.measured_provenance_required_fields",
          baseDoc: noEtaParent,
          basePin: noEtaInit.pin,
          baseReg: noEtaInit.reg,
          checkCompat: true,
          mutate: (d) => {
            d.domain_policies!.eta_policy = {
              source_kinds: ["measured"],
              append_only_slip_journal: true,
              measured_provenance_required_fields: "not-an-array" as unknown as string[],
            };
          },
        },
        {
          label: "eta_policy.rebaseline_requires_decision = 'true' (non-boolean)",
          code: "MM_DOMAIN_POLICY_INVALID",
          path: "domain_policies.eta_policy.rebaseline_requires_decision",
          baseDoc: noEtaParent,
          basePin: noEtaInit.pin,
          baseReg: noEtaInit.reg,
          checkCompat: true,
          mutate: (d) => {
            d.domain_policies!.eta_policy = {
              source_kinds: ["measured"],
              append_only_slip_journal: true,
              rebaseline_requires_decision: "true" as unknown as boolean,
            };
          },
        },
        {
          label: "M10 attributes.title.required = 0",
          code: "MM_ATTR_INVALID_DECLARATION",
          path: "node_types.WorkItem.attributes.title.required",
          baseDoc: ctx.doc,
          basePin: ctx.pin,
          baseReg: ctx.registry,
          checkCompat: true,
          mutate: (d) => { (d.node_types.WorkItem!.attributes!.title as unknown as Record<string, unknown>).required = 0; },
        },
        {
          label: "M11 node_types.WorkItem.source_backed = 0",
          code: "MM_NODE_INVALID_IDENTIFIER",
          path: "node_types.WorkItem.source_backed",
          baseDoc: ctx.doc,
          basePin: ctx.pin,
          baseReg: ctx.registry,
          mutate: (d) => { (d.node_types.WorkItem as unknown as Record<string, unknown>).source_backed = 0; },
        },
        {
          label: "M12 relation_types.governs_risk.requires_evidence = ''",
          code: "MM_ATTR_INVALID_DECLARATION",
          path: "relation_types.governs_risk.requires_evidence",
          baseDoc: ctx.doc,
          basePin: ctx.pin,
          baseReg: ctx.registry,
          mutate: (d) => { (d.relation_types!.governs_risk as unknown as Record<string, unknown>).requires_evidence = ""; },
        },
        {
          label: "M13 domain_policies.levels[1].requires_parent = null",
          code: "MM_DOMAIN_POLICY_INVALID",
          path: "domain_policies.levels[1].requires_parent",
          baseDoc: ctx.doc,
          basePin: ctx.pin,
          baseReg: ctx.registry,
          checkCompat: true,
          mutate: (d) => { (d.domain_policies!.levels![1] as unknown as Record<string, unknown>).requires_parent = null; },
        },
        {
          label: "M15 admission_policy.third_party_distinct_from_author = null",
          code: "MM_STATE_INVALID_MACHINE",
          path: "node_types.WorkItem.admission_policy.third_party_distinct_from_author",
          baseDoc: ctx.doc,
          basePin: ctx.pin,
          baseReg: ctx.registry,
          checkCompat: true,
          mutate: (d) => { (d.node_types.WorkItem!.admission_policy as unknown as Record<string, unknown>).third_party_distinct_from_author = null; },
        },
        {
          label: "node_types.WorkItem.aliases = 'work-item' (non-array)",
          code: "MM_NODE_INVALID_IDENTIFIER",
          path: "node_types.WorkItem.aliases",
          baseDoc: ctx.doc,
          basePin: ctx.pin,
          baseReg: ctx.registry,
          mutate: (d) => { (d.node_types.WorkItem as unknown as Record<string, unknown>).aliases = "work-item"; },
        },
        {
          label: "domain_policies.levels[0].modes = 'build' (non-array)",
          code: "MM_DOMAIN_POLICY_INVALID",
          path: "domain_policies.levels[0].modes",
          baseDoc: ctx.doc,
          basePin: ctx.pin,
          baseReg: ctx.registry,
          checkCompat: true,
          mutate: (d) => { (d.domain_policies!.levels![0] as unknown as Record<string, unknown>).modes = "build"; },
        },
        {
          label: "hardening.statuses = 'draft' (non-array)",
          code: "MM_STATE_INVALID_MACHINE",
          path: "hardening.statuses",
          baseDoc: ctx.doc,
          basePin: ctx.pin,
          baseReg: ctx.registry,
          mutate: (d) => { (d.hardening as unknown as Record<string, unknown>).statuses = "draft"; },
        },
        {
          label: "attributes.subkind.values = 'standard' (non-array)",
          code: "MM_ATTR_INVALID_DECLARATION",
          path: "node_types.WorkItem.attributes.subkind.values",
          baseDoc: ctx.doc,
          basePin: ctx.pin,
          baseReg: ctx.registry,
          checkCompat: true,
          mutate: (d) => { (d.node_types.WorkItem!.attributes!.subkind as unknown as Record<string, unknown>).values = "standard"; },
        },
        {
          label: "relation_types.governs_risk.source_types = 'WorkItem' (non-array)",
          code: "MM_REL_MISSING_ENDPOINTS",
          path: "relation_types.governs_risk.source_types",
          baseDoc: ctx.doc,
          basePin: ctx.pin,
          baseReg: ctx.registry,
          mutate: (d) => { (d.relation_types!.governs_risk as unknown as Record<string, unknown>).source_types = "WorkItem"; },
        },
        {
          label: "event_journal.forbid_header_lines = 'true' (non-boolean)",
          code: "MM_FILE_SHAPE_INCOMPLETE_D29_PAIR",
          path: "file_projections.default_pr_slice.event_journal.forbid_header_lines",
          baseDoc: ctx.doc,
          basePin: ctx.pin,
          baseReg: ctx.registry,
          checkCompat: true,
          mutate: (d) => { ((d.file_projections!.default_pr_slice as { event_journal: Record<string, unknown> }).event_journal).forbid_header_lines = "true"; },
        },
      ];

      for (const vec of m2Vectors) {
        const cand = { ...structuredClone(vec.baseDoc), version: "1.1.0", parent_pin: vec.basePin };
        vec.mutate(cand);
        if (vec.lot02Accepted) {
          expect(validateTemplateAgainstMetamodel(cand, { registry: vec.baseReg }).status, vec.label).toBe("accepted");
        }
        expectSemVerRefusal(cand, { registry: vec.baseReg }, vec.code, vec.path);
        const diffRes = diffSemVerDocuments(vec.baseDoc as unknown as Record<string, unknown>, cand as unknown as Record<string, unknown>);
        expect(diffRes.additive, vec.label).toEqual([]);
        expect(diffRes.breaking, vec.label).toEqual([]);
        expect(diffRes.refusals?.map((r) => ({ code: r.code, path: r.path })), vec.label).toEqual([{ code: vec.code, path: vec.path }]);
        expect(classifyV1Compatibility(vec.baseDoc as unknown as Record<string, unknown>, cand as unknown as Record<string, unknown>).refusals.map((r) => ({ code: r.code, path: r.path })), vec.label).toEqual([{ code: vec.code, path: vec.path }]);
        const compat = checkProfileCompatibility(vec.baseDoc as unknown as OntologyProfile, cand as unknown as OntologyProfile);
        expect(compat.ok, vec.label).toBe(false);
        expect(compat.compatible, vec.label).toBe(false);
        if (vec.checkCompat) {
          expect(compat.validationIssues.map((i) => ({ code: i.code, path: i.path })), vec.label).toEqual([{ code: vec.code, path: vec.path }]);
        }
      }

      // Direct widening-rule predicate checks: non-array / non-boolean never coerce to permissive defaults
      const etaRule = WIDENING_RULES.find((r) => r.id === "added-domain-eta-policy")!;
      const optAttrRule = WIDENING_RULES.find((r) => r.id === "added-optional-attr")!;
      const dummyRuleCtx = {
        oldDoc: {}, newDoc: {}, oldParent: {}, newParent: {},
        oldLevelRankById: new Map<string, number>(), newLevelRankById: new Map<string, number>(),
        oldBandIds: new Set<string>(), newBandIds: new Set<string>(),
        segments: ["domain_policies", "eta_policy"], path: "domain_policies.eta_policy",
      };
      expect(etaRule.canWiden(undefined, { source_kinds: ["measured"], append_only_slip_journal: true, measured_provenance_required_fields: "not-an-array" }, dummyRuleCtx)).toBe(false);
      expect(etaRule.canWiden(undefined, { source_kinds: ["measured"], append_only_slip_journal: true, rebaseline_requires_decision: "true" }, dummyRuleCtx)).toBe(false);
      expect(optAttrRule.canWiden(undefined, { kind: "string", required: "true" }, { ...dummyRuleCtx, segments: ["node_types", "WorkItem", "attributes", "x"], path: "node_types.WorkItem.attributes.x" })).toBe(false);
    });

    it("covers every row of PRESENTATION_ONLY_RULES and WIDENING_RULES with single-change Lot-0.2-valid vectors and literal diffs", () => {
      const ctx = makeR3RichBase();
      const mkPatch = () => ({ ...structuredClone(ctx.doc), version: "1.0.1", parent_pin: ctx.pin });
      const mkMinor = () => ({ ...structuredClone(ctx.doc), version: "1.1.0", parent_pin: ctx.pin });

      // 1. All 9 PRESENTATION_ONLY_RULES rows (PATCH accepted, exact literal diff)
      const coveredPresIds = new Set<string>();
      const patchVectors: ReadonlyArray<{
        readonly id: string;
        readonly docOnly: readonly string[];
        readonly build?: () => { readonly doc: MetamodelTemplateDocument; readonly reg: readonly RegisteredTemplateRecord[] };
        readonly mutate: (d: MetamodelTemplateDocument) => void;
      }> = [
        { id: "envelope-version", docOnly: [], mutate: () => {} },
        { id: "envelope-metadata", docOnly: [], mutate: (d) => { d.presentation_hash = independentPresentationSha256(d); } },
        { id: "registry-bound-source-path", docOnly: [], mutate: (d) => { (d.registries!.work_items as unknown as Record<string, unknown>).bound_source_path = "data/v2/work.jsonl"; } },
        { id: "top-presentation", docOnly: ["changed_presentation"], mutate: (d) => { d.presentation = { title: "Updated R3 Showcase" } as never; } },
        { id: "node-definition", docOnly: ["changed_node_definition:WorkItem"], mutate: (d) => { d.node_types.WorkItem!.definition = "Updated WorkItem wording."; } },
        { id: "node-visual-encoding", docOnly: ["changed_node_visual_encoding:WorkItem"], mutate: (d) => { d.node_types.WorkItem!.visual_encoding = { shape: "hexagon", fill: "solid", border: "bold", color_hex: "#0ea5e9" }; } },
        { id: "relation-description", docOnly: ["changed_relation_description:governs_risk"], mutate: (d) => { d.relation_types!.governs_risk!.description = "Updated risk description."; } },
        { id: "attr-description", docOnly: ["changed_attr_description:WorkItem.title"], mutate: (d) => { d.node_types.WorkItem!.attributes!.title!.description = "Updated title description."; } },
        { id: "invariant-summary", docOnly: ["changed_domain_invariant_summary:inv-uat-human-only"], mutate: (d) => { d.domain_policies!.invariants![0]!.summary = "Updated invariant wording."; } },
      ];
      for (const vec of patchVectors) {
        coveredPresIds.add(vec.id);
        const cand = mkPatch();
        vec.mutate(cand);
        assertLot02DocumentValid(cand, ctx.registry);
        expect(evaluateSemVerGate(freezeInput(cand), { registry: ctx.registry })).toMatchObject({
          status: "accepted",
          changeClass: "patch",
          diff: { breaking: [], additive: [], docOnly: [...vec.docOnly], detectedRenames: [] },
        });
      }
      // Exercise sourcePath directly on envelope-metadata as well
      const sourcePathCand = { ...mkPatch(), sourcePath: "/tmp/alt-track.yaml" };
      expect(diffSemVerDocuments(ctx.doc as unknown as Record<string, unknown>, sourcePathCand as unknown as Record<string, unknown>)).toEqual({
        breaking: [], additive: [], docOnly: [], detectedRenames: [],
      });
      expect([...coveredPresIds].sort()).toEqual(PRESENTATION_ONLY_RULES.map((r) => r.id).sort());

      // 2. All 68 WIDENING_RULES rows (PATCH -> MM_VERSION_MINOR_REQUIRED_FOR_ADDITIVE, MINOR -> accepted + exact literal diff)
      const trackNoHardening = makeTrackTemplate();
      trackNoHardening.id = "sentropic.r3-no-hardening";
      delete (trackNoHardening as { hardening?: unknown }).hardening;
      const nhInit = registerR3Initial(trackNoHardening, ctx.registry);

      const levelAutonomyParent = structuredClone(ctx.doc);
      levelAutonomyParent.id = "sentropic.r3-level-autonomy";
      delete levelAutonomyParent.domain_policies!.autonomy_policy!.max_autonomous_create_rank;
      levelAutonomyParent.domain_policies!.autonomy_policy!.max_autonomous_create_level = "feature";
      const laInit = registerR3Initial(levelAutonomyParent, ctx.registry);

      const coveredWideningIds = new Set<string>();
      const wideningVectors: ReadonlyArray<{
        readonly id: string;
        readonly idsAlsoCovered?: readonly string[];
        readonly tag: string;
        readonly baseDoc?: MetamodelTemplateDocument;
        readonly baseInit?: { readonly pin: { readonly id: string; readonly version: string; readonly contentDigest: string }; readonly reg: readonly RegisteredTemplateRecord[] };
        readonly mutate: (d: MetamodelTemplateDocument) => void;
      }> = [
        {
          id: "added-composed-pin",
          tag: "added_composed_lineage_pin:archi_v2",
          mutate: (d) => { d.composed_lineage_pins!.push({ importAlias: "archi_v2", lineage: "archi", templateId: "archi", templateVersion: "2.0.0", templateDigestSha256: ARCHI_V2_SHA256 }); },
        },
        {
          id: "updated-composed-pin-version",
          idsAlsoCovered: ["updated-composed-pin-digest"],
          tag: "updated_composed_lineage_pin:archi_v1",
          mutate: (d) => { d.composed_lineage_pins![0]!.templateVersion = "1.2.0"; d.composed_lineage_pins![0]!.templateDigestSha256 = `sha256:${"a".repeat(64)}`; },
        },
        { id: "added-registry", tag: "added_registry:risk_reg", mutate: (d) => { d.registries!.risk_reg = { source: "risk_entries", id_column: "id", label_column: "likelihood", node_type: "RiskEntry" }; } },
        { id: "added-node-type", tag: "added_node_type:Milestone", mutate: (d) => { d.node_types.Milestone = { definition: "Milestone node." }; } },
        { id: "added-node-aliases", tag: "added_node_alias:WorkItem", mutate: (d) => { d.node_types.WorkItem!.aliases = ["work-item", "wi"]; } },
        { id: "relaxed-node-source-backed", tag: "relaxed_node_source_backed:WorkItem", mutate: (d) => { d.node_types.WorkItem!.source_backed = false; } },
        { id: "added-optional-attr", tag: "added_optional_attr:WorkItem.notes", mutate: (d) => { d.node_types.WorkItem!.attributes!.notes = { kind: "string" }; } },
        { id: "relaxed-attr-required", tag: "relaxed_attr_required:WorkItem.rank", mutate: (d) => { d.node_types.WorkItem!.attributes!.rank!.required = false; } },
        { id: "widened-attr-enum", tag: "widened_attr_enum:WorkItem.subkind", mutate: (d) => { (d.node_types.WorkItem!.attributes!.subkind as { values: string[] }).values.push("chore"); } },
        { id: "widened-attr-ref-targets", tag: "widened_attr_ref_targets:WorkItem.tags.item", mutate: (d) => { ((d.node_types.WorkItem!.attributes!.tags as { item: { targetTypes: string[] } }).item).targetTypes = ["RiskEntry", "WorkItem"]; } },
        { id: "widened-attr-length", tag: "widened_attr_length:WorkItem.code", mutate: (d) => { (d.node_types.WorkItem!.attributes!.code as { maxLength: number }).maxLength = 40; } },
        { id: "widened-attr-range", tag: "widened_attr_range:WorkItem.rank", mutate: (d) => { (d.node_types.WorkItem!.attributes!.rank as { max: number }).max = 5; } },
        { id: "widened-attr-items", tag: "widened_attr_items:WorkItem.tags", mutate: (d) => { (d.node_types.WorkItem!.attributes!.tags as { maxItems: number }).maxItems = 10; } },
        { id: "relaxed-attr-pattern", tag: "relaxed_attr_pattern:WorkItem.code", mutate: (d) => { delete (d.node_types.WorkItem!.attributes!.code as { pattern?: string }).pattern; } },
        {
          id: "added-state-machine",
          tag: "added_state_machine:WorkItem.review",
          mutate: (d) => { d.node_types.WorkItem!.state_machines!.review = { states: ["open", "approved"], initial_state: "open", terminal_states: ["approved"], transitions: [{ from: ["open"], to: ["approved"], authority: "author" }] }; },
        },
        { id: "added-state", tag: "added_state:RiskEntry", mutate: (d) => { d.node_types.RiskEntry!.state_machine!.states.push("deferred"); } },
        { id: "added-terminal-state", tag: "added_terminal_state:RiskEntry", mutate: (d) => { d.node_types.RiskEntry!.state_machine!.terminal_states!.push("mitigated"); } },
        {
          id: "added-transition",
          tag: "added_transition:RiskEntry:identified->closed",
          mutate: (d) => { d.node_types.RiskEntry!.state_machine!.transitions!.push({ from: ["identified"], to: ["closed"], authority: "author" }); },
        },
        { id: "relaxed-transition-authority", tag: "relaxed_transition_authority:WorkItem.specification:scoped->specified", mutate: (d) => { d.node_types.WorkItem!.state_machines!.specification!.transitions![1]!.authority = "author"; } },
        { id: "relaxed-transition-requires", tag: "relaxed_transition_requires:WorkItem.specification:request-recorded->scoped", mutate: (d) => { d.node_types.WorkItem!.state_machines!.specification!.transitions![0]!.requires = []; } },
        {
          id: "added-hardening",
          tag: "added_hardening",
          baseDoc: trackNoHardening,
          baseInit: nhInit,
          mutate: (d) => { d.hardening = { statuses: ["draft", "verified"], default_status: "draft", promotion_requires: [], status_transitions: [{ from_statuses: ["draft"], to_statuses: ["verified"], authority: "author" }] }; },
        },
        { id: "relaxed-hardening-promotion", tag: "relaxed_hardening_promotion", mutate: (d) => { d.hardening!.promotion_requires = []; } },
        { id: "removed-admission-policy", tag: "removed_admission_policy:WorkItem", mutate: (d) => { delete d.node_types.WorkItem!.admission_policy; } },
        { id: "relaxed-admission-mode", tag: "relaxed_admission_mode:WorkItem", mutate: (d) => { d.node_types.WorkItem!.admission_policy!.mode = "bounded-auto"; } },
        { id: "relaxed-admission-distinct", tag: "relaxed_admission_distinct:WorkItem", mutate: (d) => { d.node_types.WorkItem!.admission_policy!.third_party_distinct_from_author = false; } },
        { id: "relaxed-admission-override", tag: "relaxed_admission_by_rank:WorkItem.2", mutate: (d) => { delete d.node_types.WorkItem!.admission_policy!.by_rank!["2"]; } },
        { id: "added-relation", tag: "added_relation:depends_on", mutate: (d) => { d.relation_types!.depends_on = { description: "Dependency edge.", source_types: ["WorkItem"], target_types: ["WorkItem"] }; } },
        { id: "widened-relation-endpoints", tag: "added_target_types:governs_risk", mutate: (d) => { d.relation_types!.governs_risk!.target_types = ["RiskEntry", "WorkItem"]; } },
        { id: "widened-relation-cardinality", tag: "widened_cardinality:governs_risk.out", mutate: (d) => { (d.relation_types!.governs_risk!.cardinality!.out as { max: number }).max = 5; } },
        { id: "relaxed-relation-requires-evidence", tag: "relaxed_relation_requires_evidence:governs_risk", mutate: (d) => { d.relation_types!.governs_risk!.requires_evidence = false; } },
        { id: "added-relation-basis-or-method", tag: "added_relation_assertion_basis:governs_risk", mutate: (d) => { d.relation_types!.governs_risk!.assertion_basis = ["manual", "inferred"]; } },
        { id: "added-domain-level", tag: "added_domain_level:subtask", mutate: (d) => { d.domain_policies!.levels!.push({ id: "subtask", rank: 4, modes: ["build"], requires_parent: true, rollup: false }); } },
        { id: "added-domain-level-mode", tag: "added_domain_level_mode:feature", mutate: (d) => { d.domain_policies!.levels![2]!.modes = ["build", "run"]; } },
        { id: "relaxed-level-requires-parent", tag: "relaxed_level_requires_parent:epic", mutate: (d) => { d.domain_policies!.levels![1]!.requires_parent = false; } },
        { id: "relaxed-level-closure-gate", tag: "relaxed_level_closure_gate:feature", mutate: (d) => { delete d.domain_policies!.levels![2]!.closure_gate_ref; } },
        {
          id: "added-domain-map-entry",
          tag: "added_domain_cross_cutting_axes:security",
          mutate: (d) => { d.domain_policies!.cross_cutting_axes!.security = { attribute: "sec_tag", pattern: "^SEC-[0-9]+$", inherited_downward: false }; },
        },
        { id: "added-nesting-rule", tag: "added_nesting_rule:epic", mutate: (d) => { d.domain_policies!.nesting_matrix!.push({ parent_level: "epic", parent_modes: ["run"], allowed_child_levels: ["task"] }); } },
        { id: "widened-nesting-children", tag: "widened_nesting_children:epic", mutate: (d) => { d.domain_policies!.nesting_matrix![1]!.allowed_child_levels = ["feature", "task"]; } },
        { id: "added-stage-refinement", tag: "added_stage_refinement:in-review", mutate: (d) => { d.domain_policies!.stage_refinements!.push({ parent_stage: "in-review", sub_stages: ["peer-check"] }); } },
        { id: "added-sub-stage", tag: "added_sub_stage:in-implementation", mutate: (d) => { d.domain_policies!.stage_refinements![0]!.sub_stages = ["coding", "refactor"]; } },
        { id: "relaxed-stage-witnesses", tag: "relaxed_stage_witnesses:in-implementation", mutate: (d) => { d.domain_policies!.stage_refinements![0]!.witness_link_kinds = []; } },
        { id: "added-domain-actor-class", tag: "added_domain_actor_class", mutate: (d) => { d.domain_policies!.autonomy_policy!.actor_classes = ["human", "agent", "conductor", "reviewer"]; } },
        { id: "widened-max-autonomous-create-rank", tag: "widened_max_autonomous_create_rank", mutate: (d) => { d.domain_policies!.autonomy_policy!.max_autonomous_create_rank = 3; } },
        { id: "widened-max-autonomous-create-level", tag: "widened_max_autonomous_create_level", baseDoc: levelAutonomyParent, baseInit: laInit, mutate: (d) => { d.domain_policies!.autonomy_policy!.max_autonomous_create_level = "task"; } },
        { id: "widened-autonomous-stage-ceiling", tag: "widened_autonomous_stage_ceiling:feature", mutate: (d) => { d.domain_policies!.autonomy_policy!.autonomous_stage_ceiling_by_level!.feature = "verified"; } },
        { id: "relaxed-autonomy-operations", tag: "relaxed_mandated_act_operations", mutate: (d) => { d.domain_policies!.autonomy_policy!.mandated_act_operations = ["item.create"]; } },
        { id: "added-mandated-proof-source", tag: "added_mandated_proof_source", mutate: (d) => { d.domain_policies!.autonomy_policy!.mandated_act_proof_sources = ["ci-log", "signed-attestation"]; } },
        { id: "relaxed-gate-levels", tag: "relaxed_gate_levels:feature_uat", mutate: (d) => { d.domain_policies!.acceptance_gates!.feature_uat!.applies_to_levels = ["feature"]; } },
        { id: "relaxed-gate-evidence", tag: "relaxed_gate_evidence:feature_uat", mutate: (d) => { d.domain_policies!.acceptance_gates!.feature_uat!.non_waivable_evidence_kinds = ["verification_run"]; } },
        { id: "relaxed-gate-children-terminal", tag: "relaxed_gate_children_terminal:feature_uat", mutate: (d) => { d.domain_policies!.acceptance_gates!.feature_uat!.require_all_children_terminal = false; } },
        { id: "added-timebox", tag: "added_timebox:task", mutate: (d) => { d.domain_policies!.timeboxes!.push({ applies_to_level: "task", target_days: 5, hard_ceiling_days: 10, clock_start_trigger: "in-progress", clock_stop_triggers: ["closed"] }); } },
        { id: "widened-timebox-ceiling", tag: "widened_timebox_ceiling:feature", mutate: (d) => { d.domain_policies!.timeboxes![0]!.hard_ceiling_days = 30; } },
        { id: "widened-timebox-target", tag: "widened_timebox_target:feature", mutate: (d) => { d.domain_policies!.timeboxes![0]!.target_days = 14; } },
        { id: "widened-timebox-stop-triggers", tag: "widened_timebox_stop_triggers:feature", mutate: (d) => { d.domain_policies!.timeboxes![0]!.clock_stop_triggers = ["verified", "accepted", "closed"]; } },
        {
          id: "added-domain-eta-policy",
          tag: "added_domain_policy:eta_policy",
          baseDoc: trackNoHardening,
          baseInit: nhInit,
          mutate: (d) => { d.domain_policies!.eta_policy = { source_kinds: ["measured"], append_only_slip_journal: true }; },
        },
        { id: "added-eta-source-kind", tag: "added_eta_source_kind", mutate: (d) => { d.domain_policies!.eta_policy!.source_kinds = ["measured", "estimate", "historical"]; } },
        { id: "relaxed-eta-provenance-fields", tag: "relaxed_eta_provenance_fields", mutate: (d) => { d.domain_policies!.eta_policy!.measured_provenance_required_fields = []; } },
        { id: "added-risk-severity-band", tag: "added_risk_severity_band:extreme", mutate: (d) => { d.domain_policies!.risk_policy!.severity_bands!.push({ id: "extreme", min_score: 26, max_score: 30 }); } },
        { id: "added-risk-category-or-response", tag: "added_risk_category", mutate: (d) => { d.domain_policies!.risk_policy!.categories!.push("compliance"); } },
        { id: "widened-risk-review-validity", tag: "widened_risk_review_validity:low", mutate: (d) => { d.domain_policies!.risk_policy!.max_review_validity_days_by_band!.low = 120; } },
        { id: "widened-external-register-max-age", tag: "widened_external_register_max_age", mutate: (d) => { d.domain_policies!.risk_policy!.external_register_max_age_days = 60; } },
        { id: "lowered-risk-sensitivity-floor", tag: "lowered_risk_sensitivity_floor:regulated", mutate: (d) => { d.domain_policies!.risk_policy!.sensitivity_impact_floors!.regulated = 3; } },
        { id: "relaxed-forbidden-risk-actor", tag: "relaxed_forbidden_risk_actor:accept", mutate: (d) => { d.domain_policies!.risk_policy!.forbid_actor_classes_by_response!.accept = ["agent"]; } },
        { id: "added-domain-invariant", tag: "added_domain_invariant:inv-2", mutate: (d) => { d.domain_policies!.invariants!.push({ id: "inv-2", summary: "Advisory note.", scope: "risk_policy", severity: "warning" }); } },
        { id: "relaxed-domain-invariant-severity", tag: "relaxed_domain_invariant_severity:inv-uat-human-only", mutate: (d) => { d.domain_policies!.invariants![0]!.severity = "warning"; } },
        { id: "added-file-projection", tag: "added_file_projection:secondary_pr_slice", mutate: (d) => { d.file_projections!.secondary_pr_slice = structuredClone(d.file_projections!.default_pr_slice!); } },
        { id: "added-projection-vocab", tag: "added_projection_report_sections:default_pr_slice", mutate: (d) => { (d.file_projections!.default_pr_slice as { state_snapshot: { report_sections: string[] } }).state_snapshot.report_sections.push("risks"); } },
      ];

      for (const vec of wideningVectors) {
        coveredWideningIds.add(vec.id);
        for (const extra of vec.idsAlsoCovered ?? []) coveredWideningIds.add(extra);
        const doc = vec.baseDoc ?? ctx.doc;
        const init = vec.baseInit ?? { pin: ctx.pin, reg: ctx.registry };
        const patchCand = { ...structuredClone(doc), version: "1.0.1", parent_pin: init.pin };
        vec.mutate(patchCand);
        assertLot02DocumentValid(patchCand, init.reg, vec.id);
        expectSemVerRefusal(patchCand, { registry: init.reg }, "MM_VERSION_MINOR_REQUIRED_FOR_ADDITIVE", "version");

        const minorCand = { ...structuredClone(patchCand), version: "1.1.0" };
        expect(evaluateSemVerGate(freezeInput(minorCand), { registry: init.reg })).toMatchObject({
          status: "accepted",
          changeClass: "minor",
          diff: { breaking: [], additive: [vec.tag], docOnly: [], detectedRenames: [] },
        });
      }
      expect([...coveredWideningIds].sort()).toEqual(WIDENING_RULES.map((r) => r.id).sort());
    });

    describe("round-5 single entry: each public API projects every document once, type-checks it against the closed schema and hands on a branded document", () => {
      it("makes a raw, a JSON-shaped or a merely projected document a compile error wherever a branded one is required", async () => {
        const ts = (await import("typescript")).default;
        const { fileURLToPath } = await import("node:url");
        const root = fileURLToPath(new URL("..", import.meta.url));
        const proofFile = `${root}tests/__semver_gate_brand_proof__.ts`;
        const proof = [
          'import type { JsonValue } from "../src/json-value.js";',
          'import { checkDocument, classifyProjectedDocuments, ROOT_FIELDS, type Projected, type ProjectedDocument, type RuleContext } from "../src/metamodel/semver-gate.js";',
          'import type { ValidationSink } from "../src/metamodel/validate-common.js";',
          "declare const raw: Record<string, unknown>;",
          "declare const jsonShaped: { readonly [key: string]: JsonValue };",
          "declare const projected: Projected;",
          "declare const admitted: ProjectedDocument;",
          "declare const sink: ValidationSink;",
          'const nodesOnly = checkDocument(projected, sink, ["node_types"])!;',
          'const requiredOnly = checkDocument(projected, sink, ["metamodel_version", "lineage", "id", "version", "node_types"])!;',
          "export const controls = [classifyProjectedDocuments(checkDocument(projected, sink)!, admitted), checkDocument(admitted, sink), checkDocument(nodesOnly, sink)];",
          "// @ts-expect-error a raw parent cannot reach the classifier",
          "classifyProjectedDocuments(raw, admitted);",
          "// @ts-expect-error a raw candidate cannot reach the classifier",
          "classifyProjectedDocuments(admitted, raw);",
          "// @ts-expect-error JSON-shaped data that never crossed the projector is not a projected document",
          "classifyProjectedDocuments(jsonShaped, admitted);",
          "// @ts-expect-error a projected document the closed schema has not checked cannot reach the classifier",
          "classifyProjectedDocuments(projected, admitted);",
          "// @ts-expect-error a document checked on some root fields only is not a fully checked one",
          "classifyProjectedDocuments(nodesOnly, admitted);",
          "// @ts-expect-error not even on every root field the model requires: the optional ones went unchecked",
          "classifyProjectedDocuments(requiredOnly, admitted);",
          "// @ts-expect-error nor is the result of a check over an empty field list",
          "classifyProjectedDocuments(checkDocument(projected, sink, [])!, admitted);",
          "// @ts-expect-error a raw document cannot skip the projector",
          "checkDocument(raw, sink);",
          "// @ts-expect-error nor can JSON-shaped data",
          "checkDocument(jsonShaped, sink);",
          "// @ts-expect-error the brand cannot be forged by a structurally identical value",
          "export const forged: ProjectedDocument = { ...jsonShaped };",
          "// @ts-expect-error an exported rule reads normalised documents only: a raw parent does not fit its context",
          'export const rawParentContext: Pick<RuleContext, "oldDoc"> = { oldDoc: raw };',
          "// @ts-expect-error nor does a raw candidate",
          'export const rawCandidateContext: Pick<RuleContext, "newDoc"> = { newDoc: raw };',
          "// @ts-expect-error a check over a list of fields is never the full check, not even over every root field of the schema",
          "classifyProjectedDocuments(checkDocument(projected, sink, ROOT_FIELDS)!, admitted);",
          "// @ts-expect-error a document checked on one field is not a document checked on two",
          'export const moreFields: Projected<"node_types" | "registries"> = nodesOnly;',
        ];
        const config = ts.parseJsonConfigFileContent(ts.readConfigFile(`${root}tsconfig.json`, ts.sys.readFile).config, ts.sys, root);
        const options = { ...config.options, noEmit: true, rootDir: root };
        const diagnose = (lines: readonly string[]) => {
          const text = lines.join("\n");
          const host = ts.createCompilerHost(options);
          const readSource = host.getSourceFile.bind(host);
          host.getSourceFile = (name, version, ...rest) => (name === proofFile ? ts.createSourceFile(name, text, version) : readSource(name, version, ...rest));
          host.fileExists = (name) => name === proofFile || ts.sys.fileExists(name);
          host.readFile = (name) => (name === proofFile ? text : ts.sys.readFile(name));
          const program = ts.createProgram({ rootNames: [proofFile], options, host });
          const source = program.getSourceFile(proofFile)!;
          return [...program.getSyntacticDiagnostics(source), ...program.getSemanticDiagnostics(source)]
            .map((d) => ({ line: source.getLineAndCharacterOfPosition(d.start ?? 0).line + 1, code: d.code }));
        };
        // With the directives, the proof compiles: each one is consumed by a real error, none is left unused (TS2578).
        expect(diagnose(proof)).toEqual([]);
        // Without them, exactly those fourteen lines fail to compile: an argument no signature takes (TS2345, TS2769
        // on the overloaded check) or an assignment (TS2322 / TS2741).
        const bare = proof.map((line) => (line.startsWith("// @ts-expect-error") ? "" : line));
        const errors = diagnose(bare);
        expect(errors.map((error) => error.line)).toEqual([13, 15, 17, 19, 21, 23, 25, 27, 29, 31, 33, 35, 37, 39]);
        expect(errors.every((error) => [2345, 2769, 2322, 2741].includes(error.code))).toBe(true);
      }, 120_000);

      type Base = {
        readonly doc: MetamodelTemplateDocument;
        readonly pin: { readonly id: string; readonly version: string; readonly contentDigest: string };
        readonly reg: readonly RegisteredTemplateRecord[];
      };
      type Refusal = { readonly code: MetamodelDiagnosticCode; readonly path: string };
      type Loose = Record<string | number, unknown>;
      type Mutation = (doc: MetamodelTemplateDocument) => void;

      const DOMAIN = "MM_DOMAIN_POLICY_INVALID", D29 = "MM_FILE_SHAPE_INCOMPLETE_D29_PAIR", OVERLAY = "MM_FILE_SHAPE_LINEAGE_FORBIDDEN";
      const NODE = "MM_NODE_INVALID_IDENTIFIER", STATE = "MM_STATE_INVALID_MACHINE", ATTR = "MM_ATTR_INVALID_DECLARATION";
      const UNPROJECTABLE = "MM_SYNTAX_NON_PLAIN_OBJECT";
      const EMPTY_DIFF = { breaking: [], additive: [], docOnly: [], detectedRenames: [] };
      const SLICE = "file_projections.default_pr_slice";
      const GATE_FLAG = "domain_policies.acceptance_gates.feature_uat.require_all_children_terminal";

      const asRaw = (doc: unknown) => doc as Record<string, unknown>;
      const asProfile = (doc: unknown) => doc as OntologyProfile;
      const codePath = (d: { readonly code: string; readonly path: string }) => ({ code: d.code, path: d.path });
      const jsonClone = <T,>(doc: T): T => JSON.parse(JSON.stringify(doc)) as T;

      /** "a.b[2].c" -> ["a", "b", 2, "c"] (test-side path walker; no production helper involved). */
      function pathKeys(path: string): (string | number)[] {
        return path.split(".").flatMap((segment) => {
          const [name, ...indexes] = segment.split("[");
          return [name!, ...indexes.map((idx) => Number(idx.slice(0, -1)))];
        });
      }
      function holderOf(doc: unknown, path: string): { readonly holder: Loose; readonly key: string | number } {
        const keys = pathKeys(path);
        let holder = doc as Loose;
        for (const key of keys.slice(0, -1)) holder = holder[key] as Loose;
        return { holder, key: keys.at(-1)! };
      }
      function setAt(doc: unknown, path: string, value: unknown): void {
        const { holder, key } = holderOf(doc, path);
        holder[key] = value;
      }
      function delAt(doc: unknown, path: string): void {
        const { holder, key } = holderOf(doc, path);
        delete holder[key];
      }
      function getAt(doc: unknown, path: string): unknown {
        const { holder, key } = holderOf(doc, path);
        return holder[key];
      }

      function trackBase(): Base {
        const ctx = makeR3RichBase();
        return { doc: ctx.doc, pin: ctx.pin, reg: ctx.registry };
      }
      function variantBase(id: string, mutate: Mutation): Base {
        const track = trackBase();
        const doc: MetamodelTemplateDocument = { ...structuredClone(track.doc), id };
        mutate(doc);
        const init = registerR3Initial(doc, track.reg);
        return { doc, pin: init.pin, reg: init.reg };
      }
      function h2aBase(): Base {
        const track = trackBase();
        const agile = makeTrackTemplate();
        const agileDigest = independentTemplateSha256(agile);
        const doc: MetamodelTemplateDocument = {
          ...structuredClone(makeH2aTemplate(agileDigest)),
          id: "sentropic.r5-h2a-overlay",
          relation_types: {},
          file_projections: {
            overlay_view: {
              kind: "h2a-harness-overlay",
              root_dir: ".h2a",
              relative_path_template: ".h2a/overlays/repo/view.json",
              format: "json",
              include_node_types: ["HarnessSkill"],
              order_by: ["entity_id"],
              projected_fields: ["skill_id"],
            },
          },
        };
        const init = registerR3Initial(doc, [
          ...track.reg,
          {
            lineage: "track",
            templateId: agile.id,
            templateVersion: agile.version,
            templateDigestSha256: agileDigest,
            presentationDigest: independentPresentationSha256(agile),
            nodeTypeIds: Object.keys(agile.node_types),
            document: agile,
          },
        ]);
        return { doc, pin: init.pin, reg: init.reg };
      }
      const BASES = {
        track: trackBase,
        h2a: h2aBase,
        noEta: () => variantBase("sentropic.r5-no-eta", (d) => delAt(d, "domain_policies.eta_policy")),
        gateFalse: () => variantBase("sentropic.r5-gate-false", (d) => setAt(d, GATE_FLAG, false)),
        noCeiling: () => variantBase("sentropic.r5-no-ceiling", (d) => delAt(d, "domain_policies.autonomy_policy.autonomous_stage_ceiling_by_level")),
      };
      type BaseName = keyof typeof BASES;
      const builtBases = new Map<BaseName, Base>();
      /** Bases are built once inside a running test and never mutated: every helper clones before it writes. */
      function baseOf(name: BaseName): Base {
        if (!builtBases.has(name)) builtBases.set(name, BASES[name]());
        return builtBases.get(name)!;
      }

      type CandidateOptions = {
        readonly version?: string;
        /** The Lot 0.2 validator accepts the malformed candidate: only the gate stands in its way. */
        readonly lot02Accepted?: boolean;
        /** The bundle's own schema validation refuses this candidate before it consults the gate: its issue, not the gate's. */
        readonly bundleIssue?: { readonly code: string; readonly path: string };
      };

      /** A malformed CANDIDATE is refused with exactly one stable diagnostic by the gate, the diff and the bundle. */
      function expectCandidateRefused(base: Base, mutate: Mutation, refusal: Refusal, options: CandidateOptions = {}): void {
        const cand = { ...structuredClone(base.doc), version: options.version ?? "1.1.0", parent_pin: base.pin };
        mutate(cand);
        if (options.lot02Accepted === true) expect(validateTemplateAgainstMetamodel(cand, { registry: base.reg }).status).toBe("accepted");
        const gate = evaluateSemVerGate(freezeInput(structuredClone(cand)), { registry: base.reg });
        expect({ status: gate.status, diff: gate.diff, diagnostics: gate.diagnostics.map(codePath) }).toEqual({
          status: "refused-metamodel-invalid",
          diff: null,
          diagnostics: [refusal],
        });
        const diff = diffSemVerDocuments(asRaw(base.doc), asRaw(cand));
        expect({ ...diff, refusals: diff.refusals?.map(codePath) }).toEqual({ ...EMPTY_DIFF, refusals: [refusal] });
        const pair = classifyV1Compatibility(asRaw(base.doc), asRaw(cand));
        expect({ refusals: pair.refusals.map(codePath), deltas: pair.deltas }).toEqual({ refusals: [refusal], deltas: [] });
        const compat = checkProfileCompatibility(asProfile(base.doc), asProfile(cand));
        expect({ ok: compat.ok, compatible: compat.compatible, breaking: compat.breaking, nonBreaking: compat.nonBreaking, issues: compat.validationIssues.map(codePath) }).toEqual({
          ok: false,
          compatible: false,
          breaking: [],
          nonBreaking: [],
          issues: [options.bundleIssue ?? refusal],
        });
      }

      /** A registered PARENT holding an explicit `undefined` compares as if the property were absent: never a throw. */
      function expectUndefinedParentIsInert(base: Base, path: string): void {
        const parent: MetamodelTemplateDocument = { ...structuredClone(base.doc), id: `${base.doc.id}.undef` };
        setAt(parent, path, undefined);
        const { holder, key } = holderOf(parent, path);
        expect(Object.hasOwn(holder, key) && holder[key] === undefined).toBe(true);
        const init = registerR3Initial(parent, base.reg);
        const cand = { ...jsonClone(parent), version: "1.0.1", parent_pin: init.pin };
        expect(evaluateSemVerGate(freezeInput(cand), { registry: init.reg })).toMatchObject({
          status: "accepted",
          changeClass: "patch",
          diff: EMPTY_DIFF,
          diagnostics: [],
        });
        expect(diffSemVerDocuments(asRaw(parent), asRaw(cand))).toEqual(EMPTY_DIFF);
        expect(classifyV1Compatibility(asRaw(parent), asRaw(cand)).refusals).toEqual([]);
        expect(checkProfileCompatibility(asProfile(parent), asProfile(cand))).toMatchObject({ ok: true, compatible: true, breaking: [] });
      }

      /** A registered PARENT that is not JSON-projectable is refused at the exact offending path: never a throw. */
      function expectUnprojectableParentRefused(base: Base, poison: Mutation, path: string): void {
        const parent = structuredClone(base.doc);
        poison(parent);
        const refusal: Refusal = { code: UNPROJECTABLE, path };
        const registry = base.reg.map((record) => (record.templateId === base.doc.id ? { ...record, document: parent } : record));
        const cand = { ...structuredClone(base.doc), version: "1.0.1", parent_pin: base.pin };
        const gate = evaluateSemVerGate(freezeInput(cand), { registry });
        expect({ status: gate.status, diff: gate.diff, diagnostics: gate.diagnostics.map(codePath) }).toEqual({
          status: "refused-metamodel-invalid",
          diff: null,
          diagnostics: [refusal],
        });
        const diff = diffSemVerDocuments(asRaw(parent), asRaw(cand));
        expect({ ...diff, refusals: diff.refusals?.map(codePath) }).toEqual({ ...EMPTY_DIFF, refusals: [refusal] });
        expect(classifyV1Compatibility(asRaw(parent), asRaw(cand)).refusals.map(codePath)).toEqual([refusal]);
        const compat = checkProfileCompatibility(asProfile(parent), asProfile(cand));
        expect([compat.ok, compat.compatible]).toEqual([false, false]);
      }

      type ReviewSite =
        | { readonly id: string; readonly base: BaseName; readonly kind: "candidate"; readonly mutate: Mutation; readonly refusal: Refusal; readonly options: CandidateOptions }
        | { readonly id: string; readonly base: BaseName; readonly kind: "undefined-in-parent"; readonly path: string }
        | { readonly id: string; readonly base: BaseName; readonly kind: "unprojectable-parent"; readonly poison: Mutation; readonly path: string };
      const LOT02_ACCEPTED: CandidateOptions = { lot02Accepted: true };
      const bundleFirst = (path: string): CandidateOptions => ({ bundleIssue: { code: "invalid_profile_schema", path: `new.${path}` } });
      const candidate = (id: string, base: BaseName, mutate: Mutation, path: string, code: MetamodelDiagnosticCode, options: CandidateOptions = {}): ReviewSite =>
        ({ id, base, kind: "candidate", mutate, refusal: { code, path }, options });
      const deleted = (id: string, base: BaseName, path: string, code: MetamodelDiagnosticCode): ReviewSite =>
        candidate(id, base, (d) => delAt(d, path), path, code);
      const mistyped = (id: string, base: BaseName, path: string, value: unknown, code: MetamodelDiagnosticCode, options: CandidateOptions = {}): ReviewSite =>
        candidate(id, base, (d) => setAt(d, path, value), path, code, options);
      const undefinedInParent = (id: string, base: BaseName, path: string): ReviewSite => ({ id, base, kind: "undefined-in-parent", path });
      const unprojectable = (id: string, poison: Mutation, path: string): ReviewSite => ({ id, base: "track", kind: "unprojectable-parent", poison, path });
      const addedSlice = (path: string, value: unknown): Mutation => (d) => {
        asRaw(d.file_projections).audit_slice = structuredClone(d.file_projections!.default_pr_slice);
        setAt(d, `file_projections.audit_slice.${path}`, value);
      };
      const addedNode = (body: Record<string, unknown>): Mutation => (d) => { asRaw(d.node_types).Milestone = { definition: "x", ...body }; };
      const ownerInputs = { required_folded_collections: ["items"], required_event_stream_lookbacks: ["item"], options_fields: "x", confidentiality_policy_contract: "track-owner-table-policy/v1" };
      const badEta = { source_kinds: ["measured"], append_only_slip_journal: true, measured_provenance_required_fields: "not-an-array" };
      const scalarEdgeMachine = { states: ["open", "done"], initial_state: "open", terminal_states: ["done"], transitions: [{ from: "open", to: "done" }] };

      const REVIEW_SITES: readonly ReviewSite[] = [
        // Round 3 · M-1 (M01..M08): a required container or array deleted from the candidate used to throw.
        deleted("R3-M01", "track", "domain_policies.risk_policy.severity_bands", DOMAIN),
        deleted("R3-M02", "track", "domain_policies.nesting_matrix[0].allowed_child_levels", DOMAIN),
        deleted("R3-M03", "track", "domain_policies.stage_refinements[0].sub_stages", DOMAIN),
        deleted("R3-M04", "track", `${SLICE}.event_journal`, D29),
        deleted("R3-M05", "track", `${SLICE}.state_snapshot`, D29),
        deleted("R3-M06", "track", `${SLICE}.event_journal.aggregates`, D29),
        deleted("R3-M07", "track", `${SLICE}.state_snapshot.include_collections`, D29),
        deleted("R3-M08", "h2a", "file_projections.overlay_view.include_node_types", OVERLAY),
        // Round 3 · M-1 (M09 / P2-03): explicit `undefined` in a Lot-0.2-valid parent used to throw.
        undefinedInParent("R3-M09", "track", "parent_pin"),
        undefinedInParent("R3-P2-03", "track", "node_types.WorkItem.attributes.title.description"),
        // Round 3 · M-2 (M10..M15, P2-01, P2-02): a non-boolean or non-array used to be coerced and classified ADDITIVE.
        mistyped("R3-M10", "track", "node_types.WorkItem.attributes.title.required", 0, ATTR),
        mistyped("R3-M11", "track", "node_types.WorkItem.source_backed", 0, NODE),
        mistyped("R3-M12", "track", "relation_types.governs_risk.requires_evidence", "", ATTR),
        mistyped("R3-M13", "track", "domain_policies.levels[1].requires_parent", null, DOMAIN),
        mistyped("R3-M14", "track", GATE_FLAG, null, DOMAIN, LOT02_ACCEPTED),
        mistyped("R3-M15", "track", "node_types.WorkItem.admission_policy.third_party_distinct_from_author", null, STATE),
        candidate("R3-P2-01", "noEta", (d) => setAt(d, "domain_policies.eta_policy", badEta), "domain_policies.eta_policy.measured_provenance_required_fields", DOMAIN, LOT02_ACCEPTED),
        mistyped("R3-P2-02", "gateFalse", GATE_FLAG, "false", DOMAIN, LOT02_ACCEPTED),
        // Round 4 · M-1 (F-M1-01..08): explicit `undefined` inside the parent's domain_policies / file_projections threw.
        undefinedInParent("R4-F-M1-01", "track", "domain_policies.eta_policy"),
        undefinedInParent("R4-F-M1-02", "track", "domain_policies.levels[0].closure_gate_ref"),
        undefinedInParent("R4-F-M1-03", "track", "domain_policies.risk_policy.external_register_max_age_days"),
        undefinedInParent("R4-F-M1-04", "track", "domain_policies.nesting_matrix[0].child_subkind"),
        undefinedInParent("R4-F-M1-05", "track", "domain_policies.acceptance_gates.feature_uat.designated_owner_attribute"),
        undefinedInParent("R4-F-M1-06", "track", `${SLICE}.owner_table_inputs`),
        undefinedInParent("R4-F-M1-07", "track", `${SLICE}.state_snapshot.report_sections`),
        undefinedInParent("R4-F-M1-08", "h2a", "file_projections.overlay_view.relative_path_templates"),
        // Round 4 · M-1 (F-M1-09..16): an unserializable value in the same two parent containers threw.
        unprojectable("R4-F-M1-09 bigint", (p) => setAt(p, "domain_policies.risk_policy.external_register_max_age_days", BigInt(1)), "domain_policies.risk_policy.external_register_max_age_days"),
        unprojectable("R4-F-M1-10 NaN", (p) => setAt(p, "domain_policies.timeboxes[0].target_days", Number.NaN), "domain_policies.timeboxes[0].target_days"),
        unprojectable("R4-F-M1-11 Date", (p) => setAt(p, "domain_policies.eta_policy", new Date(0)), "domain_policies.eta_policy"),
        unprojectable("R4-F-M1-12 cycle", (p) => setAt(p, "domain_policies.invariants[0].self", p.domain_policies), "domain_policies.invariants[0].self"),
        unprojectable("R4-F-M1-13 lone surrogate", (p) => setAt(p, `${SLICE}.head_anchor.format`, "\uD800"), `${SLICE}.head_anchor.format`),
        unprojectable("R4-F-M1-14 getter", (p) => { Object.defineProperty(getAt(p, `${SLICE}.event_journal`), "format", { get: () => "track-events-jsonl/v1", enumerable: true }); }, `${SLICE}.event_journal.format`),
        unprojectable("R4-F-M1-15 symbol key", (p) => { (getAt(p, `${SLICE}.state_snapshot`) as Record<symbol, unknown>)[Symbol("hidden")] = 1; }, `${SLICE}.state_snapshot`),
        unprojectable("R4-F-M1-16 sparse array", (p) => setAt(p, `${SLICE}.event_journal.aggregates`, new Array(2)), `${SLICE}.event_journal.aggregates[0]`),
        // Round 4 · M-2 site 1: scalar transition endpoints were expanded into arrays and classified ADDITIVE.
        candidate("R4-F-M2-17", "track", (d) => { (getAt(d, "node_types.RiskEntry.state_machine.transitions") as unknown[]).push({ from: "identified", to: "closed" }); }, "node_types.RiskEntry.state_machine.transitions[3]", STATE),
        candidate("R4-F-M2-18", "track", addedNode({ state_machine: scalarEdgeMachine }), "node_types.Milestone.state_machine.transitions[0]", STATE),
        // Round 4 · M-2 site 2: unchecked file-projection arrays were classified ADDITIVE (added) or BREAKING (changed).
        candidate("R4-F-M2-08", "track", addedSlice("event_journal.order_by", "stream_seq"), "file_projections.audit_slice.event_journal.order_by", D29),
        candidate("R4-F-M2-09", "track", addedSlice("event_journal.envelope_contract.core_fields", "id"), "file_projections.audit_slice.event_journal.envelope_contract.core_fields", D29),
        candidate("R4-F-M2-10", "track", addedSlice("owner_table_inputs", ownerInputs), "file_projections.audit_slice.owner_table_inputs.options_fields", D29),
        candidate("R4-F-M2-11", "h2a", (d) => { asRaw(d.file_projections).second_view = { ...structuredClone(d.file_projections!.overlay_view!), order_by: "entity_id" }; }, "file_projections.second_view.order_by", OVERLAY),
        mistyped("R4-F-M2-12", "track", `${SLICE}.event_journal.order_by`, "stream_seq", D29, { version: "2.0.0" }),
        // Round 4 · M-2 site 3: unchecked `linking` arrays and `llm.dry_run` on an added node type were ADDITIVE.
        // (The bundle validates `linking` itself and refuses first; the gate and the diff refuse with the code below.)
        candidate("R4-F-M2-14a", "track", addedNode({ linking: { normalize: { builtin: "lower" } } }), "node_types.Milestone.linking.normalize.builtin", NODE, bundleFirst("node_types.Milestone.builtin")),
        candidate("R4-F-M2-14b", "track", addedNode({ linking: { patterns: "x" } }), "node_types.Milestone.linking.patterns", NODE, bundleFirst("node_types.Milestone.linking.patterns")),
        candidate("R4-F-M2-14c", "track", addedNode({ linking: { detect: "lexicon" } }), "node_types.Milestone.linking.detect", NODE, bundleFirst("node_types.Milestone.linking.detect")),
        candidate("R4-F-M2-15", "track", addedNode({ linking: { detect: [{ llm: { trigger: "zero_candidates", dry_run: "true" } }] } }), "node_types.Milestone.linking.detect[0].llm.dry_run", NODE, bundleFirst("node_types.Milestone.linking.detect[0].llm.dry_run")),
        // Round 4 · M-2 site 4: `null` was coerced to `{}` by `??` and accepted as a PATCH with an empty diff.
        mistyped("R4-F-M2-32a", "noCeiling", "domain_policies.autonomy_policy.autonomous_stage_ceiling_by_level", null, DOMAIN, { version: "1.0.1" }),
      ];

      it.each(REVIEW_SITES)("review site $id is closed with its exact outcome: never a throw, never ADDITIVE, never PATCH", (site) => {
        const base = baseOf(site.base);
        if (site.kind === "candidate") expectCandidateRefused(base, site.mutate, site.refusal, site.options);
        else if (site.kind === "undefined-in-parent") expectUndefinedParentIsInert(base, site.path);
        else expectUnprojectableParentRefused(base, site.poison, site.path);
      });

      it("review site R4-m-1 (F-M1-23): a digest-only parent record does not skip the candidate's type check", () => {
        const track = baseOf("track");
        const digestOnly = track.reg.map(({ document: _document, ...record }) => record);
        const malformed = { ...structuredClone(track.doc), version: "1.1.0", parent_pin: track.pin };
        setAt(malformed, GATE_FLAG, null);
        expectSemVerRefusal(malformed, { registry: digestOnly }, DOMAIN, GATE_FLAG);
        const wellFormed = { ...structuredClone(track.doc), version: "1.1.0", parent_pin: track.pin };
        expect(evaluateSemVerGate(freezeInput(wellFormed), { registry: digestOnly })).toMatchObject({ status: "accepted", changeClass: "minor", diff: null });
      });

      // ---- Fresh probes of both defect classes at every level of a Lot-0.2-valid document -------------------------
      type JsonKind = "null" | "boolean" | "number" | "string" | "array" | "object";
      const JSON_KINDS: readonly JsonKind[] = ["null", "boolean", "number", "string", "array", "object"];
      const OF_KIND: Readonly<Record<JsonKind, unknown>> = { null: null, boolean: true, number: 7, string: "wrong-type", array: ["wrong-type"], object: { wrong: "type" } };
      const kindOf = (value: unknown): JsonKind => (value === null ? "null" : Array.isArray(value) ? "array" : (typeof value as JsonKind));
      const isContainer = (value: unknown): value is object => typeof value === "object" && value !== null;
      const pathOf = (holder: string, key: string | number): string => (typeof key === "number" ? `${holder}[${key}]` : holder === "" ? key : `${holder}.${key}`);

      /** Every path of a document, depth first: object members and array elements alike. */
      function* everyPath(value: unknown, path = ""): Generator<{ readonly path: string; readonly value: unknown }> {
        if (!isContainer(value)) return;
        const members: readonly (readonly [string | number, unknown])[] = Array.isArray(value) ? [...value.entries()] : Object.entries(value);
        for (const [key, member] of members) {
          yield { path: pathOf(path, key), value: member };
          yield* everyPath(member, pathOf(path, key));
        }
      }

      /** A track document that uses every member the metamodel types, and stays Lot-0.2-valid. */
      function sweepTrackBase(): Base {
        return variantBase("sentropic.r5-sweep-track", (d) => {
          asRaw(d).presentation = { theme: { accent: "#2B6CB0", dense: true } };
          asRaw(d.node_types.WorkItem).linking = {
            preset: "gazetteer-exact",
            normalize: { builtin: ["case_fold"] },
            partition_from: { source_frontmatter: "team", else: { path_segment: 1 } },
            detect: ["lexicon", { pattern: { form: "^WI-[0-9]+$", flags: "u", membership: "required", expand: { ranges: "numeric" } } }, { llm: { trigger: "zero_candidates", budget_usd: 1, dry_run: true, min_candidates: 1 } }],
            patterns: [{ form: "^WI-[0-9]+$" }],
            resolve: { mode: "exact" },
            evidence: { verbatim: "required", context_window: 80 },
          };
          Object.assign(d.node_types.RiskEntry!.attributes!, {
            due_at: { kind: "timestamp", description: "Review deadline." },
            checksum: { kind: "digest", minLength: 8, maxLength: 128, pattern: "^[a-f0-9]+$" },
            weight: { kind: "number", min: 0, max: 1 },
            flagged: { kind: "boolean" },
          });
          asRaw(d.relation_types!.child_of).hierarchy = { id: "containment", shape: "tree", parent_role: "target", child_role: "source" };
          (getAt(d, "domain_policies.nesting_matrix") as unknown[]).push({ parent_level: "feature", parent_modes: ["build"], allowed_child_levels: ["task"], child_subkind: "spike", when_attributes: { subkind: ["spike"] } });
          Object.assign(d.domain_policies!.timeboxes![0]!, { rebaseline_decision_kind: "rebaseline", overdue_escalation: "notify-owner" });
          Object.assign(d.domain_policies!.acceptance_gates!.feature_uat!, { designated_owner_attribute: "title", freshness_anchor_equality: { receipt_field: "head", target_field: "head" } });
          asRaw(d.file_projections!.default_pr_slice).owner_table_inputs = {
            required_folded_collections: ["items"],
            required_event_stream_lookbacks: ["item"],
            options_fields: ["title"],
            confidentiality_policy_contract: "track-owner-table-policy/v1",
          };
        });
      }
      function sweepH2aBase(): Base {
        const h2a = h2aBase();
        const doc: MetamodelTemplateDocument = { ...structuredClone(h2a.doc), id: "sentropic.r5-sweep-h2a" };
        Object.assign(doc.file_projections!.overlay_view!, {
          precedence: "tighten-only",
          relative_path_templates: { repo: ".h2a/overlays/repo/view.json", workspace: ".h2a/overlays/workspace/view.json", worktree: ".h2a/overlays/worktree/view.json" },
        });
        const init = registerR3Initial(doc, h2a.reg);
        return { doc, pin: init.pin, reg: init.reg };
      }
      /**
       * The members the gate types and no fixture above states. Registered by hand, not through Lot 0.2, which
       * refuses some of them (a `normalize.fn`, the bare `source` / `target` of a relation): the gate types them all the same.
       */
      function sweepRestBase(): Base {
        const track = trackBase();
        const doc: MetamodelTemplateDocument = { ...structuredClone(track.doc), id: "sentropic.r5-sweep-rest" };
        Object.assign(asRaw(doc), { presentation_hash: `sha256:${"0".repeat(64)}`, mapping_pin: { id: "map", version: "1.0.0", contentDigest: "0".repeat(64) } });
        asRaw(doc.node_types.WorkItem).status_policy = "hardening";
        setAt(doc, "node_types.WorkItem.linking.normalize", { fn: "slugify" });
        Object.assign(asRaw(doc.node_types.WorkItem!.admission_policy), { by_operation: { create: "mandate-gated" }, by_transition: { verified_closed: "mandated-act" } });
        Object.assign(asRaw(doc.registries!.work_items), { alias_columns: ["code"], partition_column: "team", bound_source_path: "data/work_items.csv" });
        Object.assign(asRaw(doc.relation_types!.governs_risk), { source: "WorkItem", target: ["RiskEntry"], derivation_method: "explicit", attributes: { rationale: { kind: "string" } } });
        setAt(doc, "domain_policies.autonomy_policy.max_autonomous_create_level", "feature");
        // The vocabularies of a projection, stated on the other kind and on a kind the model does not know.
        Object.assign(asRaw(doc.file_projections!.default_pr_slice), { include_node_types: ["WorkItem"], projected_fields: ["title"] });
        asRaw(doc.file_projections).future_view = {
          kind: "future-kind",
          include_node_types: ["WorkItem"],
          projected_fields: ["title"],
          event_journal: { aggregates: ["item"], event_types: ["created"] },
          state_snapshot: { include_collections: ["items"], report_sections: ["summary"], status_vocabulary: ["open"], stage_vocabulary: ["draft"], remaining_work_realizations: ["task"] },
        };
        const digest = independentTemplateSha256(doc);
        const record = { lineage: doc.lineage, templateId: doc.id, templateVersion: doc.version, templateDigestSha256: digest, presentationDigest: independentPresentationSha256(doc), document: doc };
        return { doc, pin: { id: doc.id, version: doc.version, contentDigest: stripSha256Prefix(digest) }, reg: [...track.reg, record] };
      }
      const REST_MEMBERS = new RegExp([
        "^node_types\\.WorkItem\\.(status_policy|linking\\.normalize|admission_policy\\.by_(operation|transition))",
        "^registries\\.work_items\\.(alias_columns|partition_column|bound_source_path)",
        "^relation_types\\.governs_risk\\.(source|target|derivation_method|attributes)(?![a-z_])",
        "^domain_policies\\.autonomy_policy\\.max_autonomous_create_level$",
        "^(presentation_hash|mapping_pin)$",
        "^file_projections\\.default_pr_slice\\.(include_node_types|projected_fields)",
        "^file_projections\\.future_view\\.",
      ].join("|"));

      /** The stable code of each area of the document, stated here independently of the production schema. */
      const AREA_CODES: ReadonlyArray<readonly [RegExp, MetamodelDiagnosticCode]> = [
        [/^(metamodel_version|lineage|id|version|default_language)$/, "MM_IDENTITY_MISSING_REQUIRED"],
        [/^presentation$/, UNPROJECTABLE],
        [/^presentation_hash$/, "MM_DIGEST_MISMATCH"],
        [/^mapping_pin$/, "MM_VERSION_UNMAPPED_BREAKING_RENAME"],
        [/^composed_lineage_pins\[\d+\]\.(lineage|templateId)$/, "MM_COMPOSE_TARGET_NOT_REGISTERED"],
        [/^composed_lineage_pins\[\d+\]\.templateVersion$/, "MM_COMPOSE_FLOATING_VERSION"],
        [/^composed_lineage_pins\[\d+\]\.templateDigestSha256$/, "MM_COMPOSE_INVALID_DIGEST"],
        [/^composed_lineage_pins/, "MM_COMPOSE_UNKNOWN_EXTERNAL_TYPE"],
        [/^registries/, "MM_NODE_INVALID_REGISTRY_REF"],
        [/^node_types$/, "MM_NODE_EMPTY_SET"],
        [/^node_types\.[^.]+\.registry$/, "MM_NODE_INVALID_REGISTRY_REF"],
        [/^node_types\.[^.]+\.visual_encoding/, "MM_NODE_INVALID_VISUAL_ENCODING"],
        [/^node_types\.[^.]+\.(attributes|properties)/, ATTR],
        [/^node_types\.[^.]+\.(state_machine|state_machines|admission_policy)/, STATE],
        [/^node_types/, NODE],
        [/^relation_types\.[^.]+\.cardinality/, "MM_REL_INVALID_CARDINALITY"],
        [/^relation_types\.[^.]+\.hierarchy/, "MM_REL_INVALID_HIERARCHY"],
        [/^relation_types\.[^.]+\.(description|requires_evidence|assertion_basis|derivation_methods?|attributes)/, ATTR],
        [/^relation_types/, "MM_REL_MISSING_ENDPOINTS"],
        [/^hardening/, STATE],
        [/^domain_policies/, DOMAIN],
        [/^file_projections\.[^.]+\.kind$/, OVERLAY],
        [/^file_projections\.[^.]+\.(root_dir|relative_path_templates?(\.\w+)?|\w+\.relative_path_template)$/, "MM_FILE_SHAPE_PATH_ESCAPE"],
        [/^file_projections\.[^.]+\.precedence$/, "MM_OVERLAY_CROSS_LINEAGE_MUTATION_FORBIDDEN"],
        [/^file_projections\.default_pr_slice\./, D29],
        [/^file_projections/, OVERLAY],
      ];
      /** Members that legitimately accept a second JSON type: writing that type there is a change, not a malformation. */
      const SECOND_TYPE: ReadonlyArray<readonly [RegExp, JsonKind]> = [
        [/\.visual_encoding$/, "null"],
        [/\.linking\.resolve$/, "string"],
        [/\.linking\.detect\[\d+\]$/, "string"],
        [/\.linking\.detect\[\d+\]$/, "object"],
        [/^hardening\.status_transitions\[\d+\]\.(from_statuses|to_statuses)$/, "string"],
        [/\.cardinality\.(in|out)\.max$/, "number"],
        [/^relation_types\.[^.]+\.(source|target|derivation_method)$/, "string"],
        [/^relation_types\.[^.]+\.(source|target|derivation_method)$/, "array"],
      ];
      /** `presentation` is free-form below its root: the gate types nothing there. */
      const UNTYPED = /^presentation\./;
      const TRANSITION_ENDPOINT = /^(.*transitions\[\d+\])\.(?:from|to|from_statuses|to_statuses)(?:\[\d+\])?$/;
      /** Members reported on their holder, as Lot 0.2 does: the two bounds of a cardinality, the two scores of a band. */
      const GROUPED_MEMBER = /^(.*(?:\.cardinality\.(?:in|out)|\.severity_bands\[\d+\]))\.(?:min|max|min_score|max_score)$/;

      /** Where a malformed value at `path` is reported: its transition, its group, its array of scalars, or itself. */
      function reportedAt(doc: unknown, path: string): string {
        const endpoint = TRANSITION_ENDPOINT.exec(path) ?? GROUPED_MEMBER.exec(path);
        if (endpoint) return endpoint[1]!;
        const element = /^(.*)\[\d+\]$/.exec(path);
        const array = element ? getAt(doc, element[1]!) : undefined;
        return Array.isArray(array) && array.every((item) => typeof item === "string" || typeof item === "number") ? element![1]! : path;
      }

      /**
       * Writes each of the five other JSON types over every typed path, on the candidate and on the registered parent.
       * The diff is asked every time; the gate (both positions) for one type per path and the bundle for one path
       * in ten, since all three share the one entry.
       */
      function sweepWrongTypes(base: Base, only?: RegExp): { readonly refused: number; readonly classified: number } {
        const tally = { refused: 0, classified: 0 };
        const clean = { ...structuredClone(base.doc), version: "1.0.1", parent_pin: base.pin };
        const asCandidate = structuredClone(clean);
        const asParent = structuredClone(base.doc);
        const parentRegistry = base.reg.map((record) => (record.templateId === base.doc.id ? { ...record, document: asParent } : record));
        const refusedAs = (result: { readonly status: string; readonly diagnostics: readonly { readonly code: string; readonly path: string }[] }) =>
          ({ status: result.status, diagnostics: result.diagnostics.map(codePath) });
        const diffOf = (parent: unknown, cand: unknown) => {
          const diff = diffSemVerDocuments(asRaw(parent), asRaw(cand));
          return { ...diff, refusals: diff.refusals?.map(codePath) };
        };
        for (const [index, { path, value }] of [...everyPath(base.doc)].entries()) {
          if (UNTYPED.test(path) || only?.test(path) === false) continue;
          const original = [getAt(asCandidate, path), getAt(asParent, path)] as const;
          const others = JSON_KINDS.filter((kind) => kind !== kindOf(value));
          for (const kind of others) {
            const label = `${path} <- ${kind}`;
            setAt(asCandidate, path, structuredClone(OF_KIND[kind]));
            setAt(asParent, path, structuredClone(OF_KIND[kind]));
            // The candidate alone, the parent alone, then both malformed at the same site: one refusal each time.
            const diffs = [diffOf(base.doc, asCandidate), diffOf(asParent, clean), diffOf(asParent, asCandidate)];
            if (SECOND_TYPE.some(([pattern, accepted]) => accepted === kind && pattern.test(path))) {
              expect(diffs.map((diff) => diff.refusals), label).toEqual([undefined, undefined, undefined]);
              tally.classified += 1;
            } else {
              const refusal: Refusal = { code: AREA_CODES.find(([pattern]) => pattern.test(path))![1], path: reportedAt(base.doc, path) };
              expect(diffs, label).toEqual(diffs.map(() => ({ ...EMPTY_DIFF, refusals: [refusal] })));
              if (kind === others[index % others.length]) {
                const refused = { status: "refused-metamodel-invalid", diagnostics: [refusal] };
                expect(refusedAs(evaluateSemVerGate(asCandidate, { registry: base.reg })), `candidate ${label}`).toEqual(refused);
                expect(refusedAs(evaluateSemVerGate(clean, { registry: parentRegistry })), `parent ${label}`).toEqual(refused);
                expect(refusedAs(evaluateSemVerGate(asCandidate, { registry: parentRegistry })), `both ${label}`).toEqual(refused);
              }
              if (index % 10 === 0 && kind === others[0]) {
                // Never compatible. `metamodel_version` alone takes the pair out of the v1 scope: the bundle then reports a breaking change itself.
                const compat = checkProfileCompatibility(asProfile(base.doc), asProfile(asCandidate));
                expect([compat.ok, compat.compatible], `bundle ${label}`).toEqual([path === "metamodel_version", false]);
              }
              tally.refused += 1;
            }
            setAt(asCandidate, path, original[0]);
            setAt(asParent, path, original[1]);
          }
        }
        expect(diffOf(asParent, asCandidate), "the sweep restores both documents").toEqual(EMPTY_DIFF);
        return tally;
      }

      it("refuses a value of another JSON type at every typed path of a Lot-0.2-valid document, as candidate and as registered parent", () => {
        expect(sweepWrongTypes(sweepTrackBase())).toEqual({ refused: 2881, classified: 9 });
        expect(sweepWrongTypes(sweepH2aBase())).toEqual({ refused: 240, classified: 0 });
      }, 120_000);

      it("does the same on the members no Lot-0.2-valid fixture states, and on the parent_pin of an upgrade", () => {
        expect(sweepWrongTypes(sweepRestBase(), REST_MEMBERS)).toEqual({ refused: 227, classified: 3 });
        const track = baseOf("track");
        const pinRefusal: Refusal = { code: "MM_VERSION_PARENT_PIN_MISSING_OR_MISMATCH", path: "parent_pin" };
        for (const kind of JSON_KINDS.filter((other) => other !== "object")) {
          const cand = { ...structuredClone(track.doc), version: "1.0.1", parent_pin: OF_KIND[kind] };
          expectSemVerRefusal(cand, { registry: track.reg }, pinRefusal.code, pinRefusal.path);
          expect(diffSemVerDocuments(asRaw(track.doc), asRaw(cand)).refusals?.map(codePath), kind).toEqual([pinRefusal]);
          expect(diffSemVerDocuments(asRaw(cand), asRaw(track.doc)).refusals?.map(codePath), kind).toEqual([pinRefusal]);
        }
      });
    });
  });
});
