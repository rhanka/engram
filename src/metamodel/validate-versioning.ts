import type { JsonValue } from "../json-value.js";
import type { LineageId, Sha256Digest } from "../metamodel-contracts.js";
import { canonicalBytes } from "../ontology-guardian/canonical.js";
import { toInternalDigest } from "../ontology-guardian/digests.js";
import type { MappingFile } from "../ontology-guardian/types.js";
import { isRecord } from "../profile-validate.js";
import type { DeclaredBreakingRename, MetamodelValidationContext, RegisteredTemplateRecord } from "./types.js";
import {
  addError,
  compareSemVer,
  isSha256Digest,
  isStringArray,
  isValidPinShape,
  parseSemVer,
  type ParsedSemVer,
  type ValidationSink,
} from "./validate-common.js";

interface SemanticDiffSummary {
  readonly breaking: string[];
  readonly additive: string[];
  readonly detectedRenames: DeclaredBreakingRename[];
}

function cardinalityMaxRank(max: number | "many"): number {
  return max === "many" ? Number.POSITIVE_INFINITY : max;
}

function normalizedCardBound(
  rel: Record<string, unknown>,
  dir: "in" | "out",
): { readonly min: number; readonly max: number | "many" } {
  const card = isRecord(rel.cardinality) ? rel.cardinality[dir] : undefined;
  if (isRecord(card) && typeof card.min === "number" && (card.max === "many" || typeof card.max === "number")) {
    return { min: card.min, max: card.max };
  }
  return { min: 0, max: "many" };
}

function diffStringSet(
  oldItems: readonly string[],
  newItems: readonly string[],
  label: string,
  breaking: string[],
  additive: string[],
): void {
  const oldSet = new Set(oldItems);
  const newSet = new Set(newItems);
  for (const item of oldSet) {
    if (!newSet.has(item)) breaking.push(`removed_${label}:${item}`);
  }
  for (const item of newSet) {
    if (!oldSet.has(item)) additive.push(`added_${label}:${item}`);
  }
}

function collectTransitionEdges(rawTransitions: unknown, fromKey: string, toKey: string): Set<string> {
  const edges = new Set<string>();
  if (!Array.isArray(rawTransitions)) return edges;
  for (const tr of rawTransitions) {
    if (!isRecord(tr)) continue;
    const rawFrom = tr[fromKey] ?? tr.from;
    const rawTo = tr[toKey] ?? tr.to;
    const froms = Array.isArray(rawFrom) ? rawFrom : typeof rawFrom === "string" ? [rawFrom] : [];
    const tos = Array.isArray(rawTo) ? rawTo : typeof rawTo === "string" ? [rawTo] : [];
    for (const f of froms) {
      if (typeof f !== "string") continue;
      for (const t of tos) {
        if (typeof t === "string") edges.add(`${f}->${t}`);
      }
    }
  }
  return edges;
}

function diffStateMachine(
  oldSm: unknown,
  newSm: unknown,
  label: string,
  breaking: string[],
  additive: string[],
): void {
  if (oldSm === undefined && newSm === undefined) return;
  if (oldSm === undefined) {
    additive.push(`added_state_machine:${label}`);
    return;
  }
  if (newSm === undefined) {
    breaking.push(`removed_state_machine:${label}`);
    return;
  }
  if (!isRecord(oldSm) || !isRecord(newSm)) return;

  diffStringSet(
    isStringArray(oldSm.states) ? oldSm.states : [],
    isStringArray(newSm.states) ? newSm.states : [],
    `state:${label}`,
    breaking,
    additive,
  );
  if (oldSm.initial_state !== newSm.initial_state) {
    breaking.push(`changed_initial_state:${label}`);
  }
  diffStringSet(
    isStringArray(oldSm.terminal_states) ? oldSm.terminal_states : [],
    isStringArray(newSm.terminal_states) ? newSm.terminal_states : [],
    `terminal_state:${label}`,
    breaking,
    additive,
  );
  const oldEdges = collectTransitionEdges(oldSm.transitions, "from", "to");
  const newEdges = collectTransitionEdges(newSm.transitions, "from", "to");
  diffStringSet([...oldEdges], [...newEdges], `transition:${label}`, breaking, additive);
}

function diffNodeTypeBody(
  nodeId: string,
  oldNode: Record<string, unknown>,
  newNode: Record<string, unknown>,
  breaking: string[],
  additive: string[],
): void {
  if (oldNode.id_prefix !== newNode.id_prefix) breaking.push(`changed_id_prefix:${nodeId}`);

  const oldAttrs = isRecord(oldNode.attributes) ? oldNode.attributes : {};
  const newAttrs = isRecord(newNode.attributes) ? newNode.attributes : {};
  for (const attr of Object.keys(oldAttrs)) {
    if (!Object.hasOwn(newAttrs, attr)) {
      breaking.push(`removed_attr:${nodeId}.${attr}`);
    } else if (isRecord(oldAttrs[attr]) && isRecord(newAttrs[attr])) {
      if (oldAttrs[attr]!.kind !== newAttrs[attr]!.kind) breaking.push(`changed_attr_kind:${nodeId}.${attr}`);
      if (oldAttrs[attr]!.required !== true && newAttrs[attr]!.required === true) {
        breaking.push(`tightened_attr_required:${nodeId}.${attr}`);
      }
    }
  }
  for (const attr of Object.keys(newAttrs)) {
    if (!Object.hasOwn(oldAttrs, attr)) {
      const isReq = isRecord(newAttrs[attr]) && newAttrs[attr]!.required === true;
      if (isReq) breaking.push(`added_required_attr:${nodeId}.${attr}`);
      else additive.push(`added_optional_attr:${nodeId}.${attr}`);
    }
  }

  diffStateMachine(oldNode.state_machine, newNode.state_machine, nodeId, breaking, additive);

  const oldAxes = isRecord(oldNode.state_machines) ? oldNode.state_machines : {};
  const newAxes = isRecord(newNode.state_machines) ? newNode.state_machines : {};
  for (const axis of Object.keys(oldAxes)) {
    if (!Object.hasOwn(newAxes, axis)) breaking.push(`removed_state_axis:${nodeId}.${axis}`);
    else diffStateMachine(oldAxes[axis], newAxes[axis], `${nodeId}.${axis}`, breaking, additive);
  }
  for (const axis of Object.keys(newAxes)) {
    if (!Object.hasOwn(oldAxes, axis)) additive.push(`added_state_axis:${nodeId}.${axis}`);
  }
}

function diffNodeTypes(
  parentDoc: Record<string, unknown>,
  candidateDoc: Record<string, unknown>,
  breaking: string[],
  additive: string[],
  detectedRenames: DeclaredBreakingRename[],
): void {
  const oldNodes = isRecord(parentDoc.node_types) ? parentDoc.node_types : {};
  const newNodes = isRecord(candidateDoc.node_types) ? candidateDoc.node_types : {};
  const removedNodeTypes: string[] = [];
  const addedNodeTypes: string[] = [];

  for (const nodeId of Object.keys(oldNodes)) {
    if (!Object.hasOwn(newNodes, nodeId)) {
      breaking.push(`removed_node_type:${nodeId}`);
      removedNodeTypes.push(nodeId);
    }
  }
  for (const nodeId of Object.keys(newNodes)) {
    if (!Object.hasOwn(oldNodes, nodeId)) {
      additive.push(`added_node_type:${nodeId}`);
      addedNodeTypes.push(nodeId);
    }
  }
  for (const removedId of removedNodeTypes) {
    for (const addedId of addedNodeTypes) {
      const addedNode = newNodes[addedId];
      const aliases = isRecord(addedNode) && Array.isArray(addedNode.aliases) ? addedNode.aliases : [];
      if (aliases.some((a) => typeof a === "string" && a.toLowerCase() === removedId.toLowerCase())) {
        detectedRenames.push({ from: `node_types.${removedId}`, to: `node_types.${addedId}` });
      }
    }
  }
  for (const nodeId of Object.keys(oldNodes)) {
    if (isRecord(oldNodes[nodeId]) && isRecord(newNodes[nodeId])) {
      diffNodeTypeBody(nodeId, oldNodes[nodeId]!, newNodes[nodeId]!, breaking, additive);
    }
  }
}

function diffRelationTypes(
  parentDoc: Record<string, unknown>,
  candidateDoc: Record<string, unknown>,
  breaking: string[],
  additive: string[],
): void {
  const oldRels = isRecord(parentDoc.relation_types) ? parentDoc.relation_types : {};
  const newRels = isRecord(candidateDoc.relation_types) ? candidateDoc.relation_types : {};
  for (const relId of Object.keys(oldRels)) {
    if (!Object.hasOwn(newRels, relId)) {
      breaking.push(`removed_relation:${relId}`);
      continue;
    }
    const oldRel = oldRels[relId];
    const newRel = newRels[relId];
    if (!isRecord(oldRel) || !isRecord(newRel)) continue;

    for (const epField of ["source_types", "target_types"] as const) {
      diffStringSet(
        isStringArray(oldRel[epField]) ? oldRel[epField] : [],
        isStringArray(newRel[epField]) ? newRel[epField] : [],
        `${epField}:${relId}`,
        breaking,
        additive,
      );
    }
    for (const dir of ["out", "in"] as const) {
      const oldB = normalizedCardBound(oldRel, dir);
      const newB = normalizedCardBound(newRel, dir);
      if (newB.min > oldB.min || cardinalityMaxRank(newB.max) < cardinalityMaxRank(oldB.max)) {
        breaking.push(`narrowed_cardinality:${relId}.${dir}`);
      } else if (newB.min < oldB.min || cardinalityMaxRank(newB.max) > cardinalityMaxRank(oldB.max)) {
        additive.push(`widened_cardinality:${relId}.${dir}`);
      }
    }
  }
  for (const relId of Object.keys(newRels)) {
    if (!Object.hasOwn(oldRels, relId)) additive.push(`added_relation:${relId}`);
  }
}

function diffHardening(
  oldH: unknown,
  newH: unknown,
  breaking: string[],
  additive: string[],
): void {
  if (oldH === undefined && newH === undefined) return;
  if (oldH === undefined) {
    additive.push("added_hardening");
    return;
  }
  if (newH === undefined) {
    breaking.push("removed_hardening");
    return;
  }
  if (!isRecord(oldH) || !isRecord(newH)) return;
  diffStringSet(
    isStringArray(oldH.statuses) ? oldH.statuses : [],
    isStringArray(newH.statuses) ? newH.statuses : [],
    "hardening_status",
    breaking,
    additive,
  );
  if (oldH.default_status !== newH.default_status) breaking.push("changed_hardening_default_status");
  const oldEdges = collectTransitionEdges(oldH.status_transitions, "from_statuses", "to_statuses");
  const newEdges = collectTransitionEdges(newH.status_transitions, "from_statuses", "to_statuses");
  diffStringSet([...oldEdges], [...newEdges], "hardening_transition", breaking, additive);
}

function diffDomainRiskAndCeilings(
  oldP: Record<string, unknown>,
  newP: Record<string, unknown>,
  breaking: string[],
  additive: string[],
): void {
  if (isRecord(oldP.autonomy_policy) && isRecord(newP.autonomy_policy)) {
    diffStringSet(
      isStringArray(oldP.autonomy_policy.actor_classes) ? oldP.autonomy_policy.actor_classes : [],
      isStringArray(newP.autonomy_policy.actor_classes) ? newP.autonomy_policy.actor_classes : [],
      "domain_actor_class",
      breaking,
      additive,
    );
    if (
      typeof oldP.autonomy_policy.max_autonomous_create_rank === "number" &&
      typeof newP.autonomy_policy.max_autonomous_create_rank === "number" &&
      newP.autonomy_policy.max_autonomous_create_rank < oldP.autonomy_policy.max_autonomous_create_rank
    ) {
      breaking.push("tightened_max_autonomous_create_rank");
    }
  }

  if (Array.isArray(oldP.timeboxes) && Array.isArray(newP.timeboxes)) {
    const keyOf = (tb: Record<string, unknown>): string => `${String(tb.applies_to_level)}\0${String(tb.subkind ?? "")}`;
    const oldMap = new Map(oldP.timeboxes.filter(isRecord).map((tb) => [keyOf(tb), tb]));
    const newMap = new Map(newP.timeboxes.filter(isRecord).map((tb) => [keyOf(tb), tb]));
    for (const [k, oldTb] of oldMap) {
      const newTb = newMap.get(k);
      if (!newTb) breaking.push(`removed_timebox:${String(oldTb.applies_to_level)}`);
      else if (
        typeof oldTb.hard_ceiling_days === "number" &&
        typeof newTb.hard_ceiling_days === "number" &&
        newTb.hard_ceiling_days < oldTb.hard_ceiling_days
      ) {
        breaking.push(`tightened_timebox_ceiling:${String(oldTb.applies_to_level)}`);
      }
    }
    for (const [k, newTb] of newMap) {
      if (!oldMap.has(k)) additive.push(`added_timebox:${String(newTb.applies_to_level)}`);
    }
  }

  if (isRecord(oldP.risk_policy) && isRecord(newP.risk_policy)) {
    const oldBands = Array.isArray(oldP.risk_policy.severity_bands)
      ? oldP.risk_policy.severity_bands.filter(isRecord).map((b) => String(b.id))
      : [];
    const newBands = Array.isArray(newP.risk_policy.severity_bands)
      ? newP.risk_policy.severity_bands.filter(isRecord).map((b) => String(b.id))
      : [];
    diffStringSet(oldBands, newBands, "risk_severity_band", breaking, additive);
    diffStringSet(
      isStringArray(oldP.risk_policy.categories) ? oldP.risk_policy.categories : [],
      isStringArray(newP.risk_policy.categories) ? newP.risk_policy.categories : [],
      "risk_category",
      breaking,
      additive,
    );
    diffStringSet(
      isStringArray(oldP.risk_policy.responses) ? oldP.risk_policy.responses : [],
      isStringArray(newP.risk_policy.responses) ? newP.risk_policy.responses : [],
      "risk_response",
      breaking,
      additive,
    );
  }
}

function diffDomainPolicies(
  oldP: unknown,
  newP: unknown,
  breaking: string[],
  additive: string[],
): void {
  if (oldP === undefined && newP === undefined) return;
  if (oldP === undefined) {
    additive.push("added_domain_policies");
    return;
  }
  if (newP === undefined) {
    breaking.push("removed_domain_policies");
    return;
  }
  if (!isRecord(oldP) || !isRecord(newP) || canonicalBytes(oldP) === canonicalBytes(newP)) return;

  const beforeB = breaking.length;
  const beforeA = additive.length;
  for (const key of Object.keys(oldP)) {
    if (!Object.hasOwn(newP, key)) breaking.push(`removed_domain_policy:${key}`);
  }
  for (const key of Object.keys(newP)) {
    if (!Object.hasOwn(oldP, key)) additive.push(`added_domain_policy:${key}`);
  }

  if (Array.isArray(oldP.levels) && Array.isArray(newP.levels)) {
    const oldLevels = new Map(oldP.levels.filter(isRecord).map((l) => [String(l.id), l]));
    const newLevels = new Map(newP.levels.filter(isRecord).map((l) => [String(l.id), l]));
    for (const [id, oldL] of oldLevels) {
      const newL = newLevels.get(id);
      if (!newL) breaking.push(`removed_domain_level:${id}`);
      else {
        if (oldL.rank !== newL.rank) breaking.push(`changed_domain_level_rank:${id}`);
        diffStringSet(
          isStringArray(oldL.modes) ? oldL.modes : [],
          isStringArray(newL.modes) ? newL.modes : [],
          `domain_level_mode:${id}`,
          breaking,
          additive,
        );
      }
    }
    for (const id of newLevels.keys()) {
      if (!oldLevels.has(id)) additive.push(`added_domain_level:${id}`);
    }
  }

  for (const mapField of ["acceptance_gates", "cross_cutting_axes", "legacy_role_remap"] as const) {
    if (isRecord(oldP[mapField]) && isRecord(newP[mapField])) {
      diffStringSet(Object.keys(oldP[mapField]), Object.keys(newP[mapField]), `domain_${mapField}`, breaking, additive);
    }
  }

  diffDomainRiskAndCeilings(oldP, newP, breaking, additive);

  if (breaking.length === beforeB && additive.length === beforeA) {
    additive.push("changed_domain_policies");
  }
}

function diffTrackSliceProjection(
  projId: string,
  oldP: Record<string, unknown>,
  newP: Record<string, unknown>,
  breaking: string[],
  additive: string[],
): void {
  if (isRecord(oldP.event_journal) && isRecord(newP.event_journal)) {
    for (const field of ["aggregates", "event_types"] as const) {
      diffStringSet(
        isStringArray(oldP.event_journal[field]) ? oldP.event_journal[field] : [],
        isStringArray(newP.event_journal[field]) ? newP.event_journal[field] : [],
        `projection_${field}:${projId}`,
        breaking,
        additive,
      );
    }
  }
  if (isRecord(oldP.state_snapshot) && isRecord(newP.state_snapshot)) {
    for (const field of [
      "include_collections",
      "status_vocabulary",
      "stage_vocabulary",
      "remaining_work_realizations",
    ] as const) {
      diffStringSet(
        isStringArray(oldP.state_snapshot[field]) ? oldP.state_snapshot[field] : [],
        isStringArray(newP.state_snapshot[field]) ? newP.state_snapshot[field] : [],
        `projection_${field}:${projId}`,
        breaking,
        additive,
      );
    }
  }
}

function diffFileProjections(
  oldFp: unknown,
  newFp: unknown,
  breaking: string[],
  additive: string[],
): void {
  if (oldFp === undefined && newFp === undefined) return;
  if (oldFp === undefined) {
    additive.push("added_file_projections");
    return;
  }
  if (newFp === undefined) {
    breaking.push("removed_file_projections");
    return;
  }
  if (!isRecord(oldFp) || !isRecord(newFp)) return;

  for (const projId of Object.keys(oldFp)) {
    if (!Object.hasOwn(newFp, projId)) {
      breaking.push(`removed_file_projection:${projId}`);
      continue;
    }
    const oldP = oldFp[projId];
    const newP = newFp[projId];
    if (!isRecord(oldP) || !isRecord(newP) || canonicalBytes(oldP) === canonicalBytes(newP)) continue;
    if (oldP.kind !== newP.kind) {
      breaking.push(`changed_file_projection_kind:${projId}`);
      continue;
    }
    const beforeB = breaking.length;
    const beforeA = additive.length;
    if (oldP.kind === "track-pr-slice") {
      diffTrackSliceProjection(projId, oldP, newP, breaking, additive);
    } else if (oldP.kind === "h2a-harness-overlay") {
      diffStringSet(
        isStringArray(oldP.include_node_types) ? oldP.include_node_types : [],
        isStringArray(newP.include_node_types) ? newP.include_node_types : [],
        `projection_node_types:${projId}`,
        breaking,
        additive,
      );
      diffStringSet(
        isStringArray(oldP.projected_fields) ? oldP.projected_fields : [],
        isStringArray(newP.projected_fields) ? newP.projected_fields : [],
        `projection_fields:${projId}`,
        breaking,
        additive,
      );
    }
    if (breaking.length === beforeB && additive.length === beforeA) {
      additive.push(`changed_file_projection:${projId}`);
    }
  }
  for (const projId of Object.keys(newFp)) {
    if (!Object.hasOwn(oldFp, projId)) additive.push(`added_file_projection:${projId}`);
  }
}

function diffMetamodelDocuments(
  parentDoc: Record<string, unknown>,
  candidateDoc: Record<string, unknown>,
): SemanticDiffSummary {
  const breaking: string[] = [];
  const additive: string[] = [];
  const detectedRenames: DeclaredBreakingRename[] = [];

  diffNodeTypes(parentDoc, candidateDoc, breaking, additive, detectedRenames);
  diffRelationTypes(parentDoc, candidateDoc, breaking, additive);
  diffHardening(parentDoc.hardening, candidateDoc.hardening, breaking, additive);
  diffDomainPolicies(parentDoc.domain_policies, candidateDoc.domain_policies, breaking, additive);
  diffFileProjections(parentDoc.file_projections, candidateDoc.file_projections, breaking, additive);

  return { breaking, additive, detectedRenames };
}

function isMappingFileCoveringRenames(
  mappingPin: unknown,
  mappingFile: MappingFile | undefined,
  renames: readonly DeclaredBreakingRename[],
): boolean {
  if (!isValidPinShape(mappingPin, "mapping_pin")) return false;
  if (mappingFile === undefined) return true;
  if (
    mappingFile.mappingId !== mappingPin.id ||
    mappingFile.version !== mappingPin.version ||
    mappingFile.contentDigest !== mappingPin.contentDigest
  ) {
    return false;
  }
  const renameEntries = mappingFile.entries.filter(
    (entry): entry is { readonly kind: "rename"; readonly from: string; readonly to: string } =>
      entry.kind === "rename",
  );
  return renames.every((rename) =>
    renameEntries.some((entry) => entry.from === rename.from && entry.to === rename.to),
  );
}

function validateParentAndSemVerDiff(
  doc: Record<string, JsonValue>,
  lineage: LineageId,
  id: string,
  version: string,
  candidateSemVer: ParsedSemVer,
  sameStreamEntries: readonly RegisteredTemplateRecord[],
  context: MetamodelValidationContext | undefined,
  sink: ValidationSink,
): void {
  if (!isValidPinShape(doc.parent_pin, "parent_pin")) {
    addError(
      sink,
      "MM_VERSION_PARENT_PIN_MISSING_OR_MISMATCH",
      "parent_pin",
      `Non-initial registration for ${lineage}:${id} requires a valid parent_pin`,
    );
    return;
  }

  const parentPin = doc.parent_pin;
  const parentRecord = sameStreamEntries.find(
    (entry) => entry.templateId === parentPin.id && entry.templateVersion === parentPin.version,
  );
  if (
    !parentRecord ||
    !isSha256Digest(parentRecord.templateDigestSha256) ||
    toInternalDigest(parentRecord.templateDigestSha256) !== parentPin.contentDigest
  ) {
    addError(
      sink,
      "MM_VERSION_PARENT_PIN_MISSING_OR_MISMATCH",
      "parent_pin",
      `parent_pin ${parentPin.id}@${parentPin.version} does not match a registered parent version/digest`,
    );
    return;
  }

  const parentSemVer = parseSemVer(parentRecord.templateVersion);
  if (parentSemVer && compareSemVer(candidateSemVer, parentSemVer) <= 0) {
    addError(
      sink,
      "MM_VERSION_REGRESSION",
      "version",
      `Candidate version ${version} must be strictly greater than parent_pin version ${parentRecord.templateVersion}`,
    );
    return;
  }

  if (!parentSemVer || !parentRecord.document) return;

  const diff = diffMetamodelDocuments(parentRecord.document as unknown as Record<string, unknown>, doc);
  const allRenames = [...diff.detectedRenames, ...(context?.declaredRenames ?? [])];

  if (diff.breaking.length > 0 && candidateSemVer.major === parentSemVer.major) {
    addError(
      sink,
      "MM_VERSION_MAJOR_REQUIRED_FOR_BREAKING",
      "version",
      `Breaking changes (${diff.breaking.join(", ")}) require a MAJOR SemVer increment over ${parentRecord.templateVersion}`,
    );
  } else if (
    diff.breaking.length === 0 &&
    diff.additive.length > 0 &&
    candidateSemVer.major === parentSemVer.major &&
    candidateSemVer.minor === parentSemVer.minor
  ) {
    addError(
      sink,
      "MM_VERSION_MINOR_REQUIRED_FOR_ADDITIVE",
      "version",
      `Additive semantic changes (${diff.additive.join(", ")}) require at least a MINOR SemVer increment over ${parentRecord.templateVersion}`,
    );
  }

  if (allRenames.length > 0 && !isMappingFileCoveringRenames(doc.mapping_pin, context?.mappingFile, allRenames)) {
    addError(
      sink,
      "MM_VERSION_UNMAPPED_BREAKING_RENAME",
      "mapping_pin",
      "Breaking rename requires a valid pinned MappingFile covering every renamed subject",
    );
  }
}

export function validateVersionProgression(
  doc: Record<string, JsonValue>,
  lineage: LineageId | null,
  id: string | null,
  version: string | null,
  templateDigestSha256: Sha256Digest,
  presentationDigest: Sha256Digest,
  context: MetamodelValidationContext | undefined,
  sink: ValidationSink,
): void {
  if (doc.parent_pin !== undefined && !isValidPinShape(doc.parent_pin, "parent_pin")) {
    addError(sink, "MM_VERSION_PARENT_PIN_MISSING_OR_MISMATCH", "parent_pin", "parent_pin must be a valid Pin { id, version, contentDigest }");
  }
  if (doc.mapping_pin !== undefined && !isValidPinShape(doc.mapping_pin, "mapping_pin")) {
    addError(sink, "MM_VERSION_UNMAPPED_BREAKING_RENAME", "mapping_pin", "mapping_pin must be a valid Pin { id, version, contentDigest }");
  }

  if (lineage === null || id === null || version === null) return;
  const candidateSemVer = parseSemVer(version);
  if (!candidateSemVer) return;

  const sameStreamEntries = (context?.registry ?? []).filter(
    (entry) => entry.lineage === lineage && entry.templateId === id,
  );

  const exactExisting = sameStreamEntries.find((entry) => entry.templateVersion === version);
  if (exactExisting) {
    const sameSemantic = exactExisting.templateDigestSha256 === templateDigestSha256;
    const samePresentation =
      exactExisting.presentationDigest === undefined ||
      exactExisting.presentationDigest === presentationDigest;
    if (!sameSemantic || !samePresentation) {
      addError(
        sink,
        "MM_VERSION_IMMUTABLE_CONFLICT",
        "version",
        `Version ${lineage}:${id}@${version} is already registered with a different digest`,
      );
    }
    return;
  }

  if (sameStreamEntries.length === 0) {
    if (context?.declaredRenames && context.declaredRenames.length > 0) {
      if (!isMappingFileCoveringRenames(doc.mapping_pin, context.mappingFile, context.declaredRenames)) {
        addError(
          sink,
          "MM_VERSION_UNMAPPED_BREAKING_RENAME",
          "mapping_pin",
          "Breaking rename requires a valid pinned MappingFile covering every renamed subject",
        );
      }
    }
    return;
  }

  validateParentAndSemVerDiff(doc, lineage, id, version, candidateSemVer, sameStreamEntries, context, sink);
}
