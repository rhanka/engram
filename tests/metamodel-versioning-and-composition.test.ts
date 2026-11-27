import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type {
  MetamodelTemplateDocument,
  RegisteredTemplateRecord,
} from "../src/metamodel/types.js";
import type { Sha256Digest } from "../src/metamodel-contracts.js";
import { ARCHI_V1, ARCHI_V1_PIN } from "../src/ontology-guardian/archi-profile.js";
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

const ARCHI_V1_SHA256: Sha256Digest = `sha256:${ARCHI_V1_PIN.contentDigest}`;
const ARCHI_V1_ENTITY_IDS = ARCHI_V1.declaration.entityTypes.map((entity) => entity.id);

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

describe("metamodel versioning and composition (Lot 0.3)", () => {
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
  });

  describe("round-3 whole-document diff, data tables, default-breaking, and R2 closures", () => {
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
    });
  });
});
