import type { JsonValue } from "../json-value.js";
import { isRecord } from "../profile-validate.js";
import {
  addError,
  hasUniqueStrings,
  isNonEmptyString,
  isStringArray,
  rejectUnknownKeys,
  VALID_ACCEPTANCE_AUTHORITIES,
  validateRegexPattern,
  type ValidationSink,
} from "./validate-common.js";

const DOMAIN_POLICIES_KEYS = new Set([
  "levels",
  "cross_cutting_axes",
  "nesting_matrix",
  "stage_refinements",
  "autonomy_policy",
  "acceptance_gates",
  "timeboxes",
  "eta_policy",
  "risk_policy",
  "legacy_role_remap",
  "invariants",
]);
const LEVEL_KEYS = new Set(["id", "rank", "modes", "requires_parent", "rollup", "closure_gate_ref"]);
const CROSS_CUTTING_AXIS_KEYS = new Set(["attribute", "pattern", "inherited_downward"]);
const NESTING_RULE_KEYS = new Set([
  "parent_level",
  "parent_modes",
  "allowed_child_levels",
  "child_subkind",
  "when_attributes",
]);
const STAGE_REFINEMENT_KEYS = new Set(["parent_stage", "sub_stages", "witness_link_kinds"]);
const AUTONOMY_POLICY_KEYS = new Set([
  "actor_classes",
  "max_autonomous_create_rank",
  "max_autonomous_create_level",
  "autonomous_stage_ceiling_by_level",
  "mandated_act_operations",
  "mandated_act_proof_sources",
  "own_act_human_operations",
  "overlay_precedence",
]);
const ACCEPTANCE_GATE_KEYS = new Set([
  "applies_to_levels",
  "authority",
  "designated_owner_attribute",
  "required_actor_class",
  "non_waivable_evidence_kinds",
  "require_all_children_terminal",
  "freshness_anchor_equality",
]);
const FRESHNESS_ANCHOR_KEYS = new Set(["receipt_field", "target_field"]);
const TIMEBOX_KEYS = new Set([
  "applies_to_level",
  "subkind",
  "target_days",
  "hard_ceiling_days",
  "clock_start_trigger",
  "clock_stop_triggers",
  "rebaseline_decision_kind",
  "overdue_escalation",
]);
const ETA_POLICY_KEYS = new Set([
  "eligible_ranks",
  "max_active_slots_per_item",
  "source_kinds",
  "measured_provenance_required_fields",
  "append_only_slip_journal",
  "rebaseline_requires_decision",
]);
const RISK_POLICY_KEYS = new Set([
  "likelihood_scale",
  "impact_scale",
  "severity_bands",
  "categories",
  "responses",
  "forbid_actor_classes_by_response",
  "max_review_validity_days_by_band",
  "external_register_max_age_days",
  "sensitivity_impact_floors",
]);
const SEVERITY_BAND_KEYS = new Set(["id", "min_score", "max_score"]);
const LEGACY_ROLE_REMAP_KEYS = new Set(["target_level", "subkind", "read_only"]);
const INVARIANT_KEYS = new Set(["id", "summary", "scope", "severity"]);

interface LevelInfo {
  readonly rank: number;
  readonly modes: ReadonlySet<string>;
}

export function collectProjectedStages(doc: Record<string, JsonValue>, collectedStates: Set<string>): void {
  if (!isRecord(doc.file_projections)) return;
  for (const proj of Object.values(doc.file_projections)) {
    if (!isRecord(proj) || !isRecord(proj.state_snapshot)) continue;
    const stages = proj.state_snapshot.stage_vocabulary;
    if (isStringArray(stages)) {
      for (const stage of stages) collectedStates.add(stage);
    }
  }
}

function validateLevels(
  rawLevels: unknown,
  acceptanceGateIds: ReadonlySet<string>,
  sink: ValidationSink,
): { readonly levelsById: Map<string, LevelInfo>; readonly declaredRanks: Set<number> } {
  const levelsById = new Map<string, LevelInfo>();
  const declaredRanks = new Set<number>();
  if (rawLevels === undefined) return { levelsById, declaredRanks };
  if (!Array.isArray(rawLevels) || rawLevels.length === 0) {
    addError(sink, "MM_DOMAIN_POLICY_INVALID", "domain_policies.levels", "levels must be a non-empty array");
    return { levelsById, declaredRanks };
  }

  rawLevels.forEach((rawLevel, idx) => {
    const lPath = `domain_policies.levels[${idx}]`;
    if (!isRecord(rawLevel)) {
      addError(sink, "MM_DOMAIN_POLICY_INVALID", lPath, "Level entry must be a plain object");
      return;
    }
    rejectUnknownKeys(rawLevel, LEVEL_KEYS, "MM_DOMAIN_POLICY_INVALID", lPath, "level", sink);
    if (!isNonEmptyString(rawLevel.id)) {
      addError(sink, "MM_DOMAIN_POLICY_INVALID", `${lPath}.id`, "Level id is required");
    } else if (levelsById.has(rawLevel.id)) {
      addError(sink, "MM_DOMAIN_POLICY_INVALID", `${lPath}.id`, `Duplicate level id ${rawLevel.id}`);
    }
    if (typeof rawLevel.rank !== "number" || !Number.isInteger(rawLevel.rank) || rawLevel.rank < 0) {
      addError(sink, "MM_DOMAIN_POLICY_INVALID", `${lPath}.rank`, "Level rank must be an integer >= 0");
    } else if (declaredRanks.has(rawLevel.rank)) {
      addError(sink, "MM_DOMAIN_POLICY_INVALID", `${lPath}.rank`, `Duplicate level rank ${rawLevel.rank}`);
    } else {
      declaredRanks.add(rawLevel.rank);
    }
    const modes = new Set<string>();
    if (rawLevel.modes !== undefined) {
      if (!isStringArray(rawLevel.modes) || rawLevel.modes.length === 0 || !hasUniqueStrings(rawLevel.modes)) {
        addError(sink, "MM_DOMAIN_POLICY_INVALID", `${lPath}.modes`, "Level modes must be a non-empty array of unique strings");
      } else {
        for (const mode of rawLevel.modes) modes.add(mode);
      }
    }
    if (rawLevel.requires_parent !== undefined && typeof rawLevel.requires_parent !== "boolean") {
      addError(sink, "MM_DOMAIN_POLICY_INVALID", `${lPath}.requires_parent`, "requires_parent must be boolean");
    }
    if (rawLevel.rollup !== undefined && typeof rawLevel.rollup !== "boolean") {
      addError(sink, "MM_DOMAIN_POLICY_INVALID", `${lPath}.rollup`, "rollup must be boolean");
    }
    if (rawLevel.closure_gate_ref !== undefined) {
      if (!isNonEmptyString(rawLevel.closure_gate_ref) || !acceptanceGateIds.has(rawLevel.closure_gate_ref)) {
        addError(
          sink,
          "MM_DOMAIN_POLICY_INVALID",
          `${lPath}.closure_gate_ref`,
          `closure_gate_ref references undeclared acceptance gate ${String(rawLevel.closure_gate_ref)}`,
        );
      }
    }
    if (isNonEmptyString(rawLevel.id) && !levelsById.has(rawLevel.id) && typeof rawLevel.rank === "number") {
      levelsById.set(rawLevel.id, { rank: rawLevel.rank, modes });
    }
  });

  return { levelsById, declaredRanks };
}

function validateCrossCuttingAxes(rawAxes: unknown, sink: ValidationSink): void {
  if (rawAxes === undefined) return;
  if (!isRecord(rawAxes)) {
    addError(sink, "MM_DOMAIN_POLICY_INVALID", "domain_policies.cross_cutting_axes", "cross_cutting_axes must be a plain object");
    return;
  }
  for (const [axisId, axis] of Object.entries(rawAxes)) {
    const aPath = `domain_policies.cross_cutting_axes.${axisId}`;
    if (!isRecord(axis)) {
      addError(sink, "MM_DOMAIN_POLICY_INVALID", aPath, "Cross-cutting axis requires a non-empty attribute name");
      continue;
    }
    rejectUnknownKeys(axis, CROSS_CUTTING_AXIS_KEYS, "MM_DOMAIN_POLICY_INVALID", aPath, "cross_cutting_axis", sink);
    if (!isNonEmptyString(axis.attribute)) {
      addError(sink, "MM_DOMAIN_POLICY_INVALID", aPath, "Cross-cutting axis requires a non-empty attribute name");
      continue;
    }
    if (axis.pattern !== undefined) {
      validateRegexPattern(axis.pattern, "MM_DOMAIN_POLICY_INVALID", `${aPath}.pattern`, sink);
    }
    if (axis.inherited_downward !== undefined && typeof axis.inherited_downward !== "boolean") {
      addError(sink, "MM_DOMAIN_POLICY_INVALID", `${aPath}.inherited_downward`, "inherited_downward must be boolean");
    }
  }
}

function validateNestingMatrix(
  rawMatrix: unknown,
  levelsById: ReadonlyMap<string, LevelInfo>,
  sink: ValidationSink,
): void {
  if (rawMatrix === undefined) return;
  if (!Array.isArray(rawMatrix)) {
    addError(sink, "MM_DOMAIN_POLICY_INVALID", "domain_policies.nesting_matrix", "nesting_matrix must be an array");
    return;
  }
  rawMatrix.forEach((rule, idx) => {
    const rPath = `domain_policies.nesting_matrix[${idx}]`;
    if (!isRecord(rule)) {
      addError(sink, "MM_DOMAIN_POLICY_INVALID", rPath, "Nesting rule must be a plain object");
      return;
    }
    rejectUnknownKeys(rule, NESTING_RULE_KEYS, "MM_DOMAIN_POLICY_INVALID", rPath, "nesting_matrix rule", sink);
    const parentLevel = isNonEmptyString(rule.parent_level) ? levelsById.get(rule.parent_level) : undefined;
    if (!parentLevel) {
      addError(
        sink,
        "MM_DOMAIN_POLICY_INVALID",
        `${rPath}.parent_level`,
        `nesting_matrix references undeclared parent_level ${String(rule.parent_level)}`,
      );
    }
    if (rule.parent_modes !== undefined) {
      if (!isStringArray(rule.parent_modes) || rule.parent_modes.length === 0) {
        addError(sink, "MM_DOMAIN_POLICY_INVALID", `${rPath}.parent_modes`, "parent_modes must be a non-empty array");
      } else if (parentLevel) {
        for (const mode of rule.parent_modes) {
          if (!parentLevel.modes.has(mode)) {
            addError(
              sink,
              "MM_DOMAIN_POLICY_INVALID",
              `${rPath}.parent_modes`,
              `Mode ${mode} is not declared on level ${String(rule.parent_level)}`,
            );
          }
        }
      }
    }
    if (!isStringArray(rule.allowed_child_levels) || rule.allowed_child_levels.length === 0) {
      addError(sink, "MM_DOMAIN_POLICY_INVALID", `${rPath}.allowed_child_levels`, "allowed_child_levels must be a non-empty array");
    } else {
      for (const childLevel of rule.allowed_child_levels) {
        if (!levelsById.has(childLevel)) {
          addError(
            sink,
            "MM_DOMAIN_POLICY_INVALID",
            `${rPath}.allowed_child_levels`,
            `nesting_matrix references undeclared child level ${childLevel}`,
          );
        }
      }
    }
    if (rule.when_attributes !== undefined) {
      if (!isRecord(rule.when_attributes)) {
        addError(sink, "MM_DOMAIN_POLICY_INVALID", `${rPath}.when_attributes`, "when_attributes must be a plain object");
      } else {
        for (const [k, vals] of Object.entries(rule.when_attributes)) {
          if (!isStringArray(vals) || vals.length === 0) {
            addError(sink, "MM_DOMAIN_POLICY_INVALID", `${rPath}.when_attributes.${k}`, "when_attributes entries must be non-empty string arrays");
          }
        }
      }
    }
  });
}

function validateStageRefinements(
  rawRefs: unknown,
  knownStagesAndStates: ReadonlySet<string>,
  sink: ValidationSink,
): void {
  if (rawRefs === undefined) return;
  if (!Array.isArray(rawRefs)) {
    addError(sink, "MM_DOMAIN_POLICY_INVALID", "domain_policies.stage_refinements", "stage_refinements must be an array");
    return;
  }
  rawRefs.forEach((ref, idx) => {
    const sPath = `domain_policies.stage_refinements[${idx}]`;
    if (!isRecord(ref)) {
      addError(sink, "MM_DOMAIN_POLICY_INVALID", sPath, "Stage refinement must be a plain object");
      return;
    }
    rejectUnknownKeys(ref, STAGE_REFINEMENT_KEYS, "MM_DOMAIN_POLICY_INVALID", sPath, "stage_refinement", sink);
    if (!isNonEmptyString(ref.parent_stage)) {
      addError(sink, "MM_DOMAIN_POLICY_INVALID", `${sPath}.parent_stage`, "parent_stage is required");
    } else if (!knownStagesAndStates.has(ref.parent_stage)) {
      addError(
        sink,
        "MM_DOMAIN_POLICY_INVALID",
        `${sPath}.parent_stage`,
        `stage_refinements references undeclared parent_stage ${ref.parent_stage}`,
      );
    }
    if (!isStringArray(ref.sub_stages) || ref.sub_stages.length === 0 || !hasUniqueStrings(ref.sub_stages)) {
      addError(sink, "MM_DOMAIN_POLICY_INVALID", `${sPath}.sub_stages`, "sub_stages must be a non-empty array of unique strings");
    }
    if (ref.witness_link_kinds !== undefined && !isStringArray(ref.witness_link_kinds)) {
      addError(sink, "MM_DOMAIN_POLICY_INVALID", `${sPath}.witness_link_kinds`, "witness_link_kinds must be an array of non-empty strings");
    }
  });
}

function validateAutonomyPolicy(
  rawAp: unknown,
  levelsById: ReadonlyMap<string, LevelInfo>,
  declaredRanks: ReadonlySet<number>,
  knownStagesAndStates: ReadonlySet<string>,
  sink: ValidationSink,
): ReadonlySet<string> | null {
  if (rawAp === undefined) return null;
  const apPath = "domain_policies.autonomy_policy";
  if (!isRecord(rawAp)) {
    addError(sink, "MM_DOMAIN_POLICY_INVALID", apPath, "autonomy_policy must be a plain object");
    return null;
  }
  rejectUnknownKeys(rawAp, AUTONOMY_POLICY_KEYS, "MM_DOMAIN_POLICY_INVALID", apPath, "autonomy_policy", sink);

  let actorClasses: ReadonlySet<string> | null = null;
  if (!isStringArray(rawAp.actor_classes) || rawAp.actor_classes.length === 0 || !hasUniqueStrings(rawAp.actor_classes)) {
    addError(sink, "MM_DOMAIN_POLICY_INVALID", `${apPath}.actor_classes`, "actor_classes must be a non-empty array of unique strings");
  } else {
    actorClasses = new Set(rawAp.actor_classes);
  }

  if (rawAp.max_autonomous_create_rank !== undefined) {
    if (
      typeof rawAp.max_autonomous_create_rank !== "number" ||
      !Number.isInteger(rawAp.max_autonomous_create_rank) ||
      rawAp.max_autonomous_create_rank < 0 ||
      (declaredRanks.size > 0 && !declaredRanks.has(rawAp.max_autonomous_create_rank))
    ) {
      addError(
        sink,
        "MM_DOMAIN_POLICY_INVALID",
        `${apPath}.max_autonomous_create_rank`,
        `Invalid max_autonomous_create_rank ${String(rawAp.max_autonomous_create_rank)}`,
      );
    }
  }
  if (rawAp.max_autonomous_create_level !== undefined) {
    if (!isNonEmptyString(rawAp.max_autonomous_create_level) || !levelsById.has(rawAp.max_autonomous_create_level)) {
      addError(
        sink,
        "MM_DOMAIN_POLICY_INVALID",
        `${apPath}.max_autonomous_create_level`,
        `Undeclared max_autonomous_create_level ${String(rawAp.max_autonomous_create_level)}`,
      );
    } else if (
      typeof rawAp.max_autonomous_create_rank === "number" &&
      levelsById.get(rawAp.max_autonomous_create_level)!.rank !== rawAp.max_autonomous_create_rank
    ) {
      addError(
        sink,
        "MM_DOMAIN_POLICY_INVALID",
        `${apPath}.max_autonomous_create_level`,
        `max_autonomous_create_level ${rawAp.max_autonomous_create_level} rank disagrees with max_autonomous_create_rank ${rawAp.max_autonomous_create_rank}`,
      );
    }
  }
  for (const opsField of ["mandated_act_operations", "mandated_act_proof_sources", "own_act_human_operations"] as const) {
    if (rawAp[opsField] !== undefined && !isStringArray(rawAp[opsField])) {
      addError(sink, "MM_DOMAIN_POLICY_INVALID", `${apPath}.${opsField}`, `${opsField} must be an array of non-empty strings`);
    }
  }
  if (rawAp.autonomous_stage_ceiling_by_level !== undefined) {
    if (!isRecord(rawAp.autonomous_stage_ceiling_by_level)) {
      addError(
        sink,
        "MM_DOMAIN_POLICY_INVALID",
        `${apPath}.autonomous_stage_ceiling_by_level`,
        "autonomous_stage_ceiling_by_level must be a plain object",
      );
    } else {
      for (const [lvl, stage] of Object.entries(rawAp.autonomous_stage_ceiling_by_level)) {
        if (!levelsById.has(lvl)) {
          addError(sink, "MM_DOMAIN_POLICY_INVALID", `${apPath}.autonomous_stage_ceiling_by_level.${lvl}`, `References undeclared level ${lvl}`);
        }
        if (!isNonEmptyString(stage) || !knownStagesAndStates.has(stage)) {
          addError(sink, "MM_DOMAIN_POLICY_INVALID", `${apPath}.autonomous_stage_ceiling_by_level.${lvl}`, `References undeclared stage ${String(stage)}`);
        }
      }
    }
  }
  if (rawAp.overlay_precedence !== undefined && rawAp.overlay_precedence !== "tighten-only") {
    addError(sink, "MM_DOMAIN_POLICY_INVALID", `${apPath}.overlay_precedence`, "overlay_precedence must be 'tighten-only'");
  }
  return actorClasses;
}

function validateAcceptanceGates(
  rawGates: unknown,
  levelsById: ReadonlyMap<string, LevelInfo>,
  actorClasses: ReadonlySet<string> | null,
  sink: ValidationSink,
): void {
  if (rawGates === undefined) return;
  if (!isRecord(rawGates)) {
    addError(sink, "MM_DOMAIN_POLICY_INVALID", "domain_policies.acceptance_gates", "acceptance_gates must be a plain object");
    return;
  }
  for (const [gateId, gate] of Object.entries(rawGates)) {
    const gPath = `domain_policies.acceptance_gates.${gateId}`;
    if (!isRecord(gate)) {
      addError(sink, "MM_DOMAIN_POLICY_INVALID", gPath, "Acceptance gate must be a plain object");
      continue;
    }
    rejectUnknownKeys(gate, ACCEPTANCE_GATE_KEYS, "MM_DOMAIN_POLICY_INVALID", gPath, "acceptance_gate", sink);
    if (!isStringArray(gate.applies_to_levels) || gate.applies_to_levels.length === 0) {
      addError(sink, "MM_DOMAIN_POLICY_INVALID", `${gPath}.applies_to_levels`, "applies_to_levels must be a non-empty array");
    } else {
      for (const lvl of gate.applies_to_levels) {
        if (!levelsById.has(lvl)) {
          addError(sink, "MM_DOMAIN_POLICY_INVALID", `${gPath}.applies_to_levels`, `Acceptance gate references undeclared level ${lvl}`);
        }
      }
    }
    if (typeof gate.authority !== "string" || !VALID_ACCEPTANCE_AUTHORITIES.has(gate.authority)) {
      addError(sink, "MM_DOMAIN_POLICY_INVALID", `${gPath}.authority`, `Unsupported acceptance gate authority ${String(gate.authority)}`);
    }
    if (gate.required_actor_class !== undefined) {
      if (!isNonEmptyString(gate.required_actor_class) || (actorClasses !== null && !actorClasses.has(gate.required_actor_class))) {
        addError(sink, "MM_DOMAIN_POLICY_INVALID", `${gPath}.required_actor_class`, `Unknown actor class ${String(gate.required_actor_class)}`);
      }
    }
    if (gate.freshness_anchor_equality !== undefined) {
      const fa = gate.freshness_anchor_equality;
      if (!isRecord(fa)) {
        addError(
          sink,
          "MM_DOMAIN_POLICY_INVALID",
          `${gPath}.freshness_anchor_equality`,
          "freshness_anchor_equality requires non-empty receipt_field and target_field",
        );
      } else {
        rejectUnknownKeys(
          fa,
          FRESHNESS_ANCHOR_KEYS,
          "MM_DOMAIN_POLICY_INVALID",
          `${gPath}.freshness_anchor_equality`,
          "freshness_anchor_equality",
          sink,
        );
        if (!isNonEmptyString(fa.receipt_field) || !isNonEmptyString(fa.target_field)) {
          addError(
            sink,
            "MM_DOMAIN_POLICY_INVALID",
            `${gPath}.freshness_anchor_equality`,
            "freshness_anchor_equality requires non-empty receipt_field and target_field",
          );
        }
      }
    }
  }
}

function validateTimeboxes(
  rawTimeboxes: unknown,
  levelsById: ReadonlyMap<string, LevelInfo>,
  sink: ValidationSink,
): void {
  if (rawTimeboxes === undefined) return;
  if (!Array.isArray(rawTimeboxes)) {
    addError(sink, "MM_DOMAIN_POLICY_INVALID", "domain_policies.timeboxes", "timeboxes must be an array");
    return;
  }
  rawTimeboxes.forEach((tb, idx) => {
    const tbPath = `domain_policies.timeboxes[${idx}]`;
    if (!isRecord(tb)) {
      addError(sink, "MM_DOMAIN_POLICY_INVALID", tbPath, "Timebox entry must be a plain object");
      return;
    }
    rejectUnknownKeys(tb, TIMEBOX_KEYS, "MM_DOMAIN_POLICY_INVALID", tbPath, "timebox", sink);
    if (!isNonEmptyString(tb.applies_to_level) || !levelsById.has(tb.applies_to_level)) {
      addError(sink, "MM_DOMAIN_POLICY_INVALID", `${tbPath}.applies_to_level`, `Timebox references undeclared level ${String(tb.applies_to_level)}`);
    }
    if (typeof tb.hard_ceiling_days !== "number" || !Number.isFinite(tb.hard_ceiling_days) || tb.hard_ceiling_days <= 0) {
      addError(sink, "MM_DOMAIN_POLICY_INVALID", `${tbPath}.hard_ceiling_days`, "hard_ceiling_days must be a positive number");
    }
    if (tb.target_days !== undefined) {
      if (typeof tb.target_days !== "number" || !Number.isFinite(tb.target_days) || tb.target_days <= 0) {
        addError(sink, "MM_DOMAIN_POLICY_INVALID", `${tbPath}.target_days`, "target_days must be a positive number");
      } else if (typeof tb.hard_ceiling_days === "number" && tb.target_days > tb.hard_ceiling_days) {
        addError(sink, "MM_DOMAIN_POLICY_INVALID", `${tbPath}.target_days`, "target_days must be <= hard_ceiling_days");
      }
    }
    if (!isNonEmptyString(tb.clock_start_trigger)) {
      addError(sink, "MM_DOMAIN_POLICY_INVALID", `${tbPath}.clock_start_trigger`, "clock_start_trigger is required");
    }
    if (!isStringArray(tb.clock_stop_triggers) || tb.clock_stop_triggers.length === 0) {
      addError(sink, "MM_DOMAIN_POLICY_INVALID", `${tbPath}.clock_stop_triggers`, "clock_stop_triggers must be a non-empty array");
    }
  });
}

function validateEtaPolicy(
  rawEta: unknown,
  declaredRanks: ReadonlySet<number>,
  sink: ValidationSink,
): void {
  if (rawEta === undefined) return;
  const ePath = "domain_policies.eta_policy";
  if (!isRecord(rawEta)) {
    addError(sink, "MM_DOMAIN_POLICY_INVALID", ePath, "eta_policy must be a plain object");
    return;
  }
  rejectUnknownKeys(rawEta, ETA_POLICY_KEYS, "MM_DOMAIN_POLICY_INVALID", ePath, "eta_policy", sink);
  if (rawEta.eligible_ranks !== undefined) {
    if (
      !Array.isArray(rawEta.eligible_ranks) ||
      rawEta.eligible_ranks.some(
        (r) => typeof r !== "number" || !Number.isInteger(r) || r < 0 || (declaredRanks.size > 0 && !declaredRanks.has(r)),
      )
    ) {
      addError(sink, "MM_DOMAIN_POLICY_INVALID", `${ePath}.eligible_ranks`, "eligible_ranks contains invalid rank");
    }
  }
  if (
    rawEta.max_active_slots_per_item !== undefined &&
    (!Number.isInteger(rawEta.max_active_slots_per_item) || Number(rawEta.max_active_slots_per_item) <= 0)
  ) {
    addError(sink, "MM_DOMAIN_POLICY_INVALID", `${ePath}.max_active_slots_per_item`, "max_active_slots_per_item must be a positive integer");
  }
  if (!isStringArray(rawEta.source_kinds) || rawEta.source_kinds.length === 0 || !hasUniqueStrings(rawEta.source_kinds)) {
    addError(sink, "MM_DOMAIN_POLICY_INVALID", `${ePath}.source_kinds`, "source_kinds must be a non-empty array of unique strings");
  }
  if (typeof rawEta.append_only_slip_journal !== "boolean") {
    addError(sink, "MM_DOMAIN_POLICY_INVALID", `${ePath}.append_only_slip_journal`, "append_only_slip_journal must be a boolean");
  }
}

function validateScale(scale: unknown, path: string, sink: ValidationSink): number[] | null {
  if (!Array.isArray(scale) || scale.length === 0) {
    addError(sink, "MM_DOMAIN_POLICY_INVALID", path, "Scale must be a non-empty array of increasing positive integers");
    return null;
  }
  const nums: number[] = [];
  for (let i = 0; i < scale.length; i += 1) {
    const val = scale[i];
    if (typeof val !== "number" || !Number.isInteger(val) || val <= 0) {
      addError(sink, "MM_DOMAIN_POLICY_INVALID", `${path}[${i}]`, "Scale entries must be positive integers");
      return null;
    }
    if (i > 0 && val <= nums[i - 1]!) {
      addError(sink, "MM_DOMAIN_POLICY_INVALID", `${path}[${i}]`, "Scale entries must be strictly increasing");
      return null;
    }
    nums.push(val);
  }
  return nums;
}

function validateSeverityBands(
  rawBands: unknown,
  rPath: string,
  likelihood: readonly number[] | null,
  impact: readonly number[] | null,
  sink: ValidationSink,
): Set<string> {
  const bandIds = new Set<string>();
  const bands: Array<{ readonly id: string; readonly min: number; readonly max: number }> = [];
  if (!Array.isArray(rawBands) || rawBands.length === 0) {
    addError(sink, "MM_DOMAIN_POLICY_INVALID", `${rPath}.severity_bands`, "severity_bands must be a non-empty array");
    return bandIds;
  }

  rawBands.forEach((band, idx) => {
    const bPath = `${rPath}.severity_bands[${idx}]`;
    if (!isRecord(band)) {
      addError(sink, "MM_DOMAIN_POLICY_INVALID", bPath, "Severity band must be a plain object");
      return;
    }
    rejectUnknownKeys(band, SEVERITY_BAND_KEYS, "MM_DOMAIN_POLICY_INVALID", bPath, "severity_band", sink);
    if (!isNonEmptyString(band.id) || bandIds.has(band.id)) {
      addError(sink, "MM_DOMAIN_POLICY_INVALID", `${bPath}.id`, "Severity band id must be a unique non-empty string");
    } else {
      bandIds.add(band.id);
    }
    if (
      typeof band.min_score !== "number" ||
      !Number.isInteger(band.min_score) ||
      typeof band.max_score !== "number" ||
      !Number.isInteger(band.max_score) ||
      band.min_score > band.max_score
    ) {
      addError(sink, "MM_DOMAIN_POLICY_INVALID", bPath, "Severity band requires integer min_score <= max_score");
    } else if (isNonEmptyString(band.id)) {
      bands.push({ id: band.id, min: band.min_score, max: band.max_score });
    }
  });

  if (bands.length > 0) {
    const sorted = [...bands].sort((a, b) => a.min - b.min);
    for (let i = 1; i < sorted.length; i += 1) {
      const prev = sorted[i - 1]!;
      const curr = sorted[i]!;
      if (curr.min !== prev.max + 1) {
        addError(
          sink,
          "MM_DOMAIN_POLICY_INVALID",
          `${rPath}.severity_bands`,
          `Severity bands must be contiguous and non-overlapping (${prev.id} ends at ${prev.max}, ${curr.id} starts at ${curr.min})`,
        );
        break;
      }
    }
    if (likelihood && impact) {
      const minProduct = likelihood[0]! * impact[0]!;
      const maxProduct = likelihood[likelihood.length - 1]! * impact[impact.length - 1]!;
      if (sorted[0]!.min > minProduct || sorted[sorted.length - 1]!.max < maxProduct) {
        addError(
          sink,
          "MM_DOMAIN_POLICY_INVALID",
          `${rPath}.severity_bands`,
          `Severity bands must cover score range [${minProduct}, ${maxProduct}]`,
        );
      }
    }
  }
  return bandIds;
}

function validateRiskGovernanceMaps(
  rawRisk: Record<string, unknown>,
  rPath: string,
  bandIds: ReadonlySet<string>,
  responseSet: ReadonlySet<string>,
  actorClasses: ReadonlySet<string> | null,
  impact: readonly number[] | null,
  sink: ValidationSink,
): void {
  if (rawRisk.forbid_actor_classes_by_response !== undefined) {
    if (!isRecord(rawRisk.forbid_actor_classes_by_response)) {
      addError(sink, "MM_DOMAIN_POLICY_INVALID", `${rPath}.forbid_actor_classes_by_response`, "forbid_actor_classes_by_response must be a plain object");
    } else {
      for (const [resp, actors] of Object.entries(rawRisk.forbid_actor_classes_by_response)) {
        if (!responseSet.has(resp)) {
          addError(sink, "MM_DOMAIN_POLICY_INVALID", `${rPath}.forbid_actor_classes_by_response.${resp}`, `References undeclared risk response ${resp}`);
        }
        if (!isStringArray(actors)) {
          addError(sink, "MM_DOMAIN_POLICY_INVALID", `${rPath}.forbid_actor_classes_by_response.${resp}`, "Forbidden actor classes must be an array of non-empty strings");
        } else if (actorClasses !== null) {
          for (const actor of actors) {
            if (!actorClasses.has(actor)) {
              addError(sink, "MM_DOMAIN_POLICY_INVALID", `${rPath}.forbid_actor_classes_by_response.${resp}`, `References undeclared actor class ${actor}`);
            }
          }
        }
      }
    }
  }

  if (rawRisk.max_review_validity_days_by_band !== undefined) {
    if (!isRecord(rawRisk.max_review_validity_days_by_band)) {
      addError(sink, "MM_DOMAIN_POLICY_INVALID", `${rPath}.max_review_validity_days_by_band`, "max_review_validity_days_by_band must be a plain object");
    } else {
      for (const [bandId, days] of Object.entries(rawRisk.max_review_validity_days_by_band)) {
        if (!bandIds.has(bandId)) {
          addError(sink, "MM_DOMAIN_POLICY_INVALID", `${rPath}.max_review_validity_days_by_band.${bandId}`, `References undeclared severity band ${bandId}`);
        }
        if (typeof days !== "number" || !Number.isFinite(days) || days <= 0) {
          addError(sink, "MM_DOMAIN_POLICY_INVALID", `${rPath}.max_review_validity_days_by_band.${bandId}`, "Review validity days must be a positive number");
        }
      }
    }
  }

  if (
    rawRisk.external_register_max_age_days !== undefined &&
    (typeof rawRisk.external_register_max_age_days !== "number" ||
      !Number.isFinite(rawRisk.external_register_max_age_days) ||
      rawRisk.external_register_max_age_days <= 0)
  ) {
    addError(sink, "MM_DOMAIN_POLICY_INVALID", `${rPath}.external_register_max_age_days`, "external_register_max_age_days must be a positive number");
  }

  if (rawRisk.sensitivity_impact_floors !== undefined) {
    if (!isRecord(rawRisk.sensitivity_impact_floors)) {
      addError(sink, "MM_DOMAIN_POLICY_INVALID", `${rPath}.sensitivity_impact_floors`, "sensitivity_impact_floors must be a plain object");
    } else {
      const minImpact = impact ? impact[0]! : 1;
      const maxImpact = impact ? impact[impact.length - 1]! : Number.MAX_SAFE_INTEGER;
      for (const [label, floor] of Object.entries(rawRisk.sensitivity_impact_floors)) {
        if (typeof floor !== "number" || !Number.isFinite(floor) || floor < minImpact || floor > maxImpact) {
          addError(
            sink,
            "MM_DOMAIN_POLICY_INVALID",
            `${rPath}.sensitivity_impact_floors.${label}`,
            `Sensitivity floor must fall within impact scale [${minImpact}, ${maxImpact}]`,
          );
        }
      }
    }
  }
}

function validateRiskPolicy(
  rawRisk: unknown,
  actorClasses: ReadonlySet<string> | null,
  sink: ValidationSink,
): void {
  if (rawRisk === undefined) return;
  const rPath = "domain_policies.risk_policy";
  if (!isRecord(rawRisk)) {
    addError(sink, "MM_DOMAIN_POLICY_INVALID", rPath, "risk_policy must be a plain object");
    return;
  }
  rejectUnknownKeys(rawRisk, RISK_POLICY_KEYS, "MM_DOMAIN_POLICY_INVALID", rPath, "risk_policy", sink);

  const likelihood = validateScale(rawRisk.likelihood_scale, `${rPath}.likelihood_scale`, sink);
  const impact = validateScale(rawRisk.impact_scale, `${rPath}.impact_scale`, sink);
  const bandIds = validateSeverityBands(rawRisk.severity_bands, rPath, likelihood, impact, sink);

  if (!isStringArray(rawRisk.categories) || rawRisk.categories.length === 0 || !hasUniqueStrings(rawRisk.categories)) {
    addError(sink, "MM_DOMAIN_POLICY_INVALID", `${rPath}.categories`, "risk_policy.categories must be unique strings");
  }
  const responseSet = new Set<string>();
  if (!isStringArray(rawRisk.responses) || rawRisk.responses.length === 0 || !hasUniqueStrings(rawRisk.responses)) {
    addError(sink, "MM_DOMAIN_POLICY_INVALID", `${rPath}.responses`, "risk_policy.responses must be unique strings");
  } else {
    for (const r of rawRisk.responses) responseSet.add(r);
  }

  validateRiskGovernanceMaps(rawRisk, rPath, bandIds, responseSet, actorClasses, impact, sink);
}

function validateLegacyRoleRemap(
  rawRemap: unknown,
  levelsById: ReadonlyMap<string, LevelInfo>,
  sink: ValidationSink,
): void {
  if (rawRemap === undefined) return;
  if (!isRecord(rawRemap)) {
    addError(sink, "MM_DOMAIN_POLICY_INVALID", "domain_policies.legacy_role_remap", "legacy_role_remap must be a plain object");
    return;
  }
  for (const [token, mapping] of Object.entries(rawRemap)) {
    const mPath = `domain_policies.legacy_role_remap.${token}`;
    if (!isRecord(mapping)) {
      addError(sink, "MM_DOMAIN_POLICY_INVALID", mPath, "legacy_role_remap entry must be a plain object");
      continue;
    }
    rejectUnknownKeys(mapping, LEGACY_ROLE_REMAP_KEYS, "MM_DOMAIN_POLICY_INVALID", mPath, "legacy_role_remap entry", sink);
    if (!isNonEmptyString(mapping.target_level) || !levelsById.has(mapping.target_level)) {
      addError(sink, "MM_DOMAIN_POLICY_INVALID", `${mPath}.target_level`, `legacy_role_remap references undeclared target_level ${String(mapping.target_level)}`);
    }
    if (mapping.read_only !== true) {
      addError(sink, "MM_DOMAIN_POLICY_INVALID", `${mPath}.read_only`, "legacy_role_remap.read_only must be true");
    }
  }
}

function validateInvariants(rawInvariants: unknown, sink: ValidationSink): void {
  if (rawInvariants === undefined) return;
  if (!Array.isArray(rawInvariants)) {
    addError(sink, "MM_DOMAIN_POLICY_INVALID", "domain_policies.invariants", "invariants must be an array");
    return;
  }
  const seenIds = new Set<string>();
  rawInvariants.forEach((inv, idx) => {
    const iPath = `domain_policies.invariants[${idx}]`;
    if (!isRecord(inv)) {
      addError(sink, "MM_DOMAIN_POLICY_INVALID", iPath, "Invariant must be a plain object");
      return;
    }
    rejectUnknownKeys(inv, INVARIANT_KEYS, "MM_DOMAIN_POLICY_INVALID", iPath, "invariant", sink);
    if (!isNonEmptyString(inv.id) || seenIds.has(inv.id)) {
      addError(sink, "MM_DOMAIN_POLICY_INVALID", `${iPath}.id`, "Invariant id must be a unique non-empty string");
    } else {
      seenIds.add(inv.id);
    }
    if (!isNonEmptyString(inv.summary)) {
      addError(sink, "MM_DOMAIN_POLICY_INVALID", `${iPath}.summary`, "Invariant summary is required");
    }
    if (!isNonEmptyString(inv.scope)) {
      addError(sink, "MM_DOMAIN_POLICY_INVALID", `${iPath}.scope`, "Invariant scope is required");
    }
    if (inv.severity !== "error" && inv.severity !== "warning") {
      addError(sink, "MM_DOMAIN_POLICY_INVALID", `${iPath}.severity`, "Invariant severity must be 'error' or 'warning'");
    }
  });
}

export function validateDomainPolicies(
  rawPolicies: unknown,
  knownStagesAndStates: ReadonlySet<string>,
  sink: ValidationSink,
): void {
  if (rawPolicies === undefined) return;
  if (!isRecord(rawPolicies)) {
    addError(sink, "MM_DOMAIN_POLICY_INVALID", "domain_policies", "domain_policies must be a plain object");
    return;
  }
  rejectUnknownKeys(rawPolicies, DOMAIN_POLICIES_KEYS, "MM_DOMAIN_POLICY_INVALID", "domain_policies", "domain_policies", sink);
  const acceptanceGateIds = new Set<string>(
    isRecord(rawPolicies.acceptance_gates) ? Object.keys(rawPolicies.acceptance_gates) : [],
  );
  const { levelsById, declaredRanks } = validateLevels(rawPolicies.levels, acceptanceGateIds, sink);
  validateCrossCuttingAxes(rawPolicies.cross_cutting_axes, sink);
  validateNestingMatrix(rawPolicies.nesting_matrix, levelsById, sink);
  validateStageRefinements(rawPolicies.stage_refinements, knownStagesAndStates, sink);
  const actorClasses = validateAutonomyPolicy(
    rawPolicies.autonomy_policy,
    levelsById,
    declaredRanks,
    knownStagesAndStates,
    sink,
  );
  validateAcceptanceGates(rawPolicies.acceptance_gates, levelsById, actorClasses, sink);
  validateTimeboxes(rawPolicies.timeboxes, levelsById, sink);
  validateEtaPolicy(rawPolicies.eta_policy, declaredRanks, sink);
  validateRiskPolicy(rawPolicies.risk_policy, actorClasses, sink);
  validateLegacyRoleRemap(rawPolicies.legacy_role_remap, levelsById, sink);
  validateInvariants(rawPolicies.invariants, sink);
}
