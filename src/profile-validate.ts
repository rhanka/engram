import { validateExtraction } from "./validate.js";
import type { MetamodelTemplateDocument, StateMachineDecl } from "./metamodel/types.js";
import type {
  Extraction,
  GraphEdge,
  GraphNode,
  NormalizedOntologyProfile,
  OntologyRelationCardinality,
} from "./types.js";

export const INVALID_RELATION_CARDINALITY = "MM_REL_INVALID_CARDINALITY";

export function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function validateRelationCardinality(cardinality: unknown, path: string): string[] {
  if (cardinality === undefined) return [];
  if (!isRecord(cardinality)) {
    return [`${path} ${INVALID_RELATION_CARDINALITY}: expected an object with optional in and out bounds`];
  }
  const entries = Object.entries(cardinality);
  if (entries.some(([key]) => key !== "in" && key !== "out")) {
    return [`${path} ${INVALID_RELATION_CARDINALITY}: expected an object with optional in and out bounds`];
  }

  const errors: string[] = [];
  for (const [direction, bound] of entries) {
    if (bound === undefined) continue;
    if (
      !isRecord(bound) ||
      Object.entries(bound).some(([key]) => key !== "min" && key !== "max") ||
      typeof bound.min !== "number" ||
      !Number.isInteger(bound.min) ||
      bound.min < 0 ||
      (bound.max !== "many" && (typeof bound.max !== "number" || !Number.isInteger(bound.max) || bound.max < bound.min))
    ) {
      errors.push(`${path}.${direction} ${INVALID_RELATION_CARDINALITY}: expected integer min >= 0 and integer max >= min or "many"`);
    }
  }
  return errors;
}

export type ProfileValidationSeverity = "error" | "warning" | "info";

export interface ProfileValidationIssue {
  severity: ProfileValidationSeverity;
  code: string;
  message: string;
  path?: string;
  nodeId?: string;
  edgeIndex?: number;
}

export interface ProfileValidationContext {
  profile: NormalizedOntologyProfile;
  registryExtraction?: Extraction;
  metamodelTemplate?: MetamodelTemplateDocument;
}

export interface ProfileValidationResult {
  valid: boolean;
  profile_id: string;
  profile_version: string;
  profile_hash: string;
  baseErrors: string[];
  issues: ProfileValidationIssue[];
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  }
  return typeof value === "string" && value.trim() ? [value.trim()] : [];
}

function citations(value: Record<string, unknown>): Array<Record<string, unknown>> {
  return Array.isArray(value.citations)
    ? value.citations.filter((item): item is Record<string, unknown> =>
      typeof item === "object" && item !== null && !Array.isArray(item))
    : [];
}

function hasPageCitation(citation: Record<string, unknown>): boolean {
  const page = citation.page;
  return typeof page === "number" || (typeof page === "string" && page.trim().length > 0);
}

function addIssue(
  issues: ProfileValidationIssue[],
  issue: ProfileValidationIssue,
): void {
  issues.push(issue);
}

function validateCitations(
  entity: Record<string, unknown>,
  profile: NormalizedOntologyProfile,
  issues: ProfileValidationIssue[],
  where: { nodeId?: string; edgeIndex?: number; path: string },
): void {
  const entityCitations = citations(entity);
  if (profile.citation_policy.require_source_file) {
    if (entityCitations.length === 0 || !entityCitations.some((citation) => stringValue(citation.source_file))) {
      addIssue(issues, {
        severity: "error",
        code: "missing_citation_source_file",
        message: `${where.path} must include a citation with source_file`,
        ...where,
      });
    }
  }

  if (profile.citation_policy.minimum_granularity === "page") {
    if (entityCitations.length === 0 || !entityCitations.some(hasPageCitation)) {
      addIssue(issues, {
        severity: "error",
        code: "missing_citation_page",
        message: `${where.path} must include a page-level citation`,
        ...where,
      });
    }
  }
}

function validateStatus(
  entity: Record<string, unknown>,
  profile: NormalizedOntologyProfile,
  issues: ProfileValidationIssue[],
  where: { nodeId?: string; edgeIndex?: number; path: string },
): void {
  const status = stringValue(entity.status);
  if (!status) return;
  if (!profile.hardening.statuses.includes(status)) {
    addIssue(issues, {
      severity: "error",
      code: "unknown_status",
      message: `${where.path} has unknown status ${status}`,
      ...where,
    });
  }

  const previousStatus = stringValue(entity.previous_status);
  const transitions = profile.hardening.status_transitions ?? [];
  if (!previousStatus || previousStatus === status || transitions.length === 0) return;
  if (!profile.hardening.statuses.includes(previousStatus)) {
    addIssue(issues, {
      severity: "error",
      code: "unknown_previous_status",
      message: `${where.path} has unknown previous_status ${previousStatus}`,
      ...where,
    });
    return;
  }

  const allowed = transitions.some((transition) =>
    transition.from_statuses.includes(previousStatus) && transition.to_statuses.includes(status)
  );
  if (!allowed) {
    addIssue(issues, {
      severity: "error",
      code: "invalid_status_transition",
      message: `${where.path} cannot transition from ${previousStatus} to ${status}`,
      ...where,
    });
  }
}

function buildEvidenceIds(extraction: Extraction): Set<string> {
  const ids = new Set<string>();
  for (const evidence of extraction.evidence ?? []) {
    if (typeof evidence.id === "string" && evidence.id.trim()) ids.add(evidence.id.trim());
  }
  return ids;
}

function buildRegistryRecords(registryExtraction?: Extraction): Map<string, Set<string>> {
  const records = new Map<string, Set<string>>();
  for (const node of registryExtraction?.nodes ?? []) {
    const registryId = stringValue(node.registry_id);
    const recordId = stringValue(node.registry_record_id);
    if (!registryId || !recordId) continue;
    const set = records.get(registryId) ?? new Set<string>();
    set.add(recordId);
    records.set(registryId, set);
  }
  return records;
}

function validateEvidenceRefs(
  entity: Record<string, unknown>,
  profile: NormalizedOntologyProfile,
  evidenceIds: Set<string>,
  issues: ProfileValidationIssue[],
  where: { nodeId?: string; edgeIndex?: number; path: string },
  options: { required?: boolean; minRefs?: number } = {},
): void {
  const refs = stringArray(entity.evidence_refs);
  const required = options.required === true;
  const minRefs = Math.max(options.minRefs ?? 0, required ? 1 : 0);
  if (refs.length < minRefs) {
    addIssue(issues, {
      severity: "error",
      code: "missing_evidence_ref",
      message: `${where.path} must include at least ${minRefs} evidence_refs`,
      ...where,
    });
  }

  if (evidenceIds.size === 0) return;
  for (const ref of refs) {
    if (!evidenceIds.has(ref)) {
      addIssue(issues, {
        severity: "error",
        code: "unknown_evidence_ref",
        message: `${where.path} references unknown evidence ${ref}`,
        ...where,
      });
    }
  }
}

function validateRegistryRefs(
  node: GraphNode,
  profile: NormalizedOntologyProfile,
  registryRecords: Map<string, Set<string>>,
  issues: ProfileValidationIssue[],
  index: number,
): void {
  const registryId = stringValue(node.registry_id);
  const recordId = stringValue(node.registry_record_id);
  if (!registryId && !recordId) return;
  const nodePath = `nodes[${index}]`;
  if (!profile.registries[registryId]) {
    addIssue(issues, {
      severity: "error",
      code: "unknown_registry_ref",
      message: `${nodePath} references unknown registry ${registryId || "(missing)"}`,
      path: nodePath,
      nodeId: node.id,
    });
    return;
  }
  if (registryRecords.size === 0 || !recordId) return;
  if (!registryRecords.get(registryId)?.has(recordId)) {
    addIssue(issues, {
      severity: "error",
      code: "unknown_registry_record_ref",
      message: `${nodePath} references unknown registry record ${registryId}:${recordId}`,
      path: nodePath,
      nodeId: node.id,
    });
  }
}

function isRegistrySeed(node: GraphNode): boolean {
  return Boolean(stringValue(node.registry_id) && stringValue(node.registry_record_id));
}

function isStateMachineDecl(value: unknown): value is StateMachineDecl {
  return (
    isRecord(value) &&
    Array.isArray(value.states) &&
    value.states.every((state) => typeof state === "string") &&
    typeof value.initial_state === "string" &&
    Array.isArray(value.transitions)
  );
}

function getNodeStateMachine(
  profileNodeType: Record<string, unknown>,
  nodeType: string,
  metamodelTemplate?: MetamodelTemplateDocument,
): StateMachineDecl | undefined {
  if (isStateMachineDecl(profileNodeType.state_machine)) return profileNodeType.state_machine;
  const tmplNode = metamodelTemplate?.node_types[nodeType];
  return tmplNode && isStateMachineDecl(tmplNode.state_machine) ? tmplNode.state_machine : undefined;
}

function getNodeStateMachines(
  profileNodeType: Record<string, unknown>,
  nodeType: string,
  metamodelTemplate?: MetamodelTemplateDocument,
): Readonly<Record<string, StateMachineDecl>> | undefined {
  const raw = isRecord(profileNodeType.state_machines)
    ? profileNodeType.state_machines
    : metamodelTemplate?.node_types[nodeType]?.state_machines;
  if (!isRecord(raw)) return undefined;
  const axes: Record<string, StateMachineDecl> = {};
  for (const [axis, machine] of Object.entries(raw)) {
    if (isStateMachineDecl(machine)) axes[axis] = machine;
  }
  return Object.keys(axes).length > 0 ? axes : undefined;
}

function validateAgainstStateMachine(
  currentStatus: string,
  previousStatus: string,
  machine: StateMachineDecl,
  issues: ProfileValidationIssue[],
  where: { nodeId?: string; edgeIndex?: number; path: string },
  axisLabel?: string,
): void {
  if (!currentStatus) return;
  const label = axisLabel ? ` axis ${axisLabel}` : "";
  if (!machine.states.includes(currentStatus)) {
    addIssue(issues, {
      severity: "error",
      code: "unknown_status",
      message: `${where.path}${label} has unknown status ${currentStatus}`,
      ...where,
    });
    return;
  }
  if (!previousStatus || previousStatus === currentStatus) return;
  if (!machine.states.includes(previousStatus)) {
    addIssue(issues, {
      severity: "error",
      code: "unknown_previous_status",
      message: `${where.path}${label} has unknown previous_status ${previousStatus}`,
      ...where,
    });
    return;
  }
  const allowed = machine.transitions.some(
    (transition) =>
      Array.isArray(transition.from) &&
      Array.isArray(transition.to) &&
      transition.from.includes(previousStatus) &&
      transition.to.includes(currentStatus),
  );
  if (!allowed) {
    addIssue(issues, {
      severity: "error",
      code: "invalid_status_transition",
      message: `${where.path}${label} cannot transition from ${previousStatus} to ${currentStatus}`,
      ...where,
    });
  }
}

function validateNodeStateMachines(
  node: GraphNode,
  profileNodeType: Record<string, unknown>,
  nodeType: string,
  profile: NormalizedOntologyProfile,
  metamodelTemplate: MetamodelTemplateDocument | undefined,
  issues: ProfileValidationIssue[],
  where: { nodeId?: string; path: string },
): void {
  const singleMachine = getNodeStateMachine(profileNodeType, nodeType, metamodelTemplate);
  const multiMachines = getNodeStateMachines(profileNodeType, nodeType, metamodelTemplate);

  if (singleMachine) {
    validateAgainstStateMachine(
      stringValue(node.status),
      stringValue(node.previous_status),
      singleMachine,
      issues,
      where,
    );
  }

  if (multiMachines) {
    if (node.states !== undefined && !isRecord(node.states)) {
      addIssue(issues, {
        severity: "error",
        code: "unknown_status",
        message: `${where.path}.states must be a plain object mapping state axes to statuses`,
        nodeId: where.nodeId,
        path: `${where.path}.states`,
      });
    }
    if (node.previous_states !== undefined && !isRecord(node.previous_states)) {
      addIssue(issues, {
        severity: "error",
        code: "unknown_previous_status",
        message: `${where.path}.previous_states must be a plain object mapping state axes to statuses`,
        nodeId: where.nodeId,
        path: `${where.path}.previous_states`,
      });
    }

    const rawStates = isRecord(node.states) ? node.states : undefined;
    const rawPrevStates = isRecord(node.previous_states) ? node.previous_states : undefined;
    const rawAttrs = isRecord(node.attributes) ? node.attributes : undefined;

    for (const [label, map] of [
      ["states", rawStates],
      ["previous_states", rawPrevStates],
    ] as const) {
      if (!map) continue;
      for (const [axisName] of Object.entries(map)) {
        if (!Object.hasOwn(multiMachines, axisName)) {
          addIssue(issues, {
            severity: "error",
            code: "unknown_state_axis",
            message: `${where.path} references unknown state axis ${axisName}`,
            nodeId: where.nodeId,
            path: `${where.path}.${label}.${axisName}`,
          });
        }
      }
    }

    for (const [axisName, machine] of Object.entries(multiMachines)) {
      const rawCurrent = rawStates?.[axisName];
      if (rawCurrent !== undefined && (typeof rawCurrent !== "string" || rawCurrent.trim().length === 0)) {
        addIssue(issues, {
          severity: "error",
          code: "unknown_status",
          message: `${where.path} axis ${axisName} status must be a non-empty string`,
          nodeId: where.nodeId,
          path: `${where.path}.states.${axisName}`,
        });
        continue;
      }
      const rawPrev = rawPrevStates?.[axisName];
      let previousState = "";
      if (rawPrev !== undefined && (typeof rawPrev !== "string" || rawPrev.trim().length === 0)) {
        addIssue(issues, {
          severity: "error",
          code: "unknown_previous_status",
          message: `${where.path} axis ${axisName} previous_status must be a non-empty string`,
          nodeId: where.nodeId,
          path: `${where.path}.previous_states.${axisName}`,
        });
      } else {
        previousState = stringValue(rawPrev) || stringValue(node[`previous_${axisName}`]);
      }
      const currentState =
        stringValue(rawCurrent) ||
        stringValue(node[axisName]) ||
        stringValue(rawAttrs?.[axisName]);
      validateAgainstStateMachine(
        currentState,
        previousState,
        machine,
        issues,
        { nodeId: where.nodeId, path: `${where.path}.states.${axisName}` },
        axisName,
      );
    }
  }

  if (!singleMachine && !multiMachines) {
    validateStatus(node, profile, issues, where);
  }
}

function validateNode(
  node: GraphNode,
  profile: NormalizedOntologyProfile,
  evidenceIds: Set<string>,
  registryRecords: Map<string, Set<string>>,
  issues: ProfileValidationIssue[],
  index: number,
  metamodelTemplate?: MetamodelTemplateDocument,
): void {
  const nodeType = stringValue(node.node_type);
  if (!nodeType) return;

  const nodePath = `nodes[${index}]`;
  const profileNodeType = profile.node_types[nodeType];
  if (!profileNodeType) {
    addIssue(issues, {
      severity: "error",
      code: "unknown_node_type",
      message: `${nodePath} uses unknown node_type ${nodeType}`,
      path: nodePath,
      nodeId: node.id,
    });
    return;
  }

  validateNodeStateMachines(
    node,
    profileNodeType as unknown as Record<string, unknown>,
    nodeType,
    profile,
    metamodelTemplate,
    issues,
    { nodeId: node.id, path: nodePath },
  );
  validateRegistryRefs(node, profile, registryRecords, issues, index);
  const evidencePolicy = profile.evidence_policy ?? {
    require_evidence_refs: false,
    min_refs: 0,
    node_types: [],
    relation_types: [],
  };
  const evidenceRequired = evidencePolicy.require_evidence_refs
    && (evidencePolicy.node_types.length === 0 || evidencePolicy.node_types.includes(nodeType));
  validateEvidenceRefs(node, profile, evidenceIds, issues, { nodeId: node.id, path: nodePath }, {
    required: evidenceRequired,
    minRefs: evidenceRequired ? evidencePolicy.min_refs : 0,
  });
  if (!isRegistrySeed(node)) {
    validateCitations(node, profile, issues, { nodeId: node.id, path: nodePath });
  }

  if (profileNodeType.registry && (!stringValue(node.registry_id) || !stringValue(node.registry_record_id))) {
    addIssue(issues, {
      severity: "warning",
      code: "missing_registry_link",
      message: `${nodePath} node_type ${nodeType} should reference registry ${profileNodeType.registry}`,
      path: nodePath,
      nodeId: node.id,
    });
  }
}

function isProfileEdge(
  edge: GraphEdge,
  profile: NormalizedOntologyProfile,
  sourceNode?: GraphNode,
  targetNode?: GraphNode,
): boolean {
  const relation = stringValue(edge.relation);
  return Boolean(
    profile.relation_types[relation] ||
    stringValue(sourceNode?.node_type) ||
    stringValue(targetNode?.node_type) ||
    stringValue(edge.status) ||
    citations(edge).length > 0,
  );
}

function validateEdge(
  edge: GraphEdge,
  profile: NormalizedOntologyProfile,
  nodesById: Map<string, GraphNode>,
  evidenceIds: Set<string>,
  issues: ProfileValidationIssue[],
  index: number,
): void {
  const edgePath = `edges[${index}]`;
  const sourceNode = nodesById.get(edge.source);
  const targetNode = nodesById.get(edge.target);
  if (!isProfileEdge(edge, profile, sourceNode, targetNode)) return;

  validateStatus(edge, profile, issues, { edgeIndex: index, path: edgePath });
  validateCitations(edge, profile, issues, { edgeIndex: index, path: edgePath });

  const relation = stringValue(edge.relation);
  const relationSpec = profile.relation_types[relation];
  if (!relationSpec) {
    addIssue(issues, {
      severity: "error",
      code: "unknown_relation",
      message: `${edgePath} uses unknown profile relation ${relation}`,
      path: edgePath,
      edgeIndex: index,
    });
    return;
  }

  const inferencePolicy = profile.inference_policy ?? {
    allow_inferred_relations: true,
    allowed_relation_types: [],
    require_evidence_refs: false,
  };
  const evidencePolicy = profile.evidence_policy ?? {
    require_evidence_refs: false,
    min_refs: 0,
    node_types: [],
    relation_types: [],
  };
  const inferenceAllowed = inferencePolicy.allow_inferred_relations
    || inferencePolicy.allowed_relation_types.includes(relation);
  if (edge.confidence === "INFERRED" && !inferenceAllowed) {
    addIssue(issues, {
      severity: "error",
      code: "inferred_relation_disallowed",
      message: `${edgePath} relation ${relation} is INFERRED but inferred relations are disallowed`,
      path: edgePath,
      edgeIndex: index,
    });
  }

  const evidenceRequired = relationSpec.requires_evidence === true
    || inferencePolicy.require_evidence_refs
    || (
      evidencePolicy.require_evidence_refs
      && (
        evidencePolicy.relation_types.length === 0
        || evidencePolicy.relation_types.includes(relation)
      )
    );
  validateEvidenceRefs(edge, profile, evidenceIds, issues, { edgeIndex: index, path: edgePath }, {
    required: evidenceRequired,
    minRefs: evidenceRequired ? evidencePolicy.min_refs : 0,
  });

  const sourceType = stringValue(sourceNode?.node_type);
  if (sourceType && !relationSpec.source_types.includes(sourceType)) {
    addIssue(issues, {
      severity: "error",
      code: "incompatible_source_type",
      message: `${edgePath} relation ${relation} does not allow source node_type ${sourceType}`,
      path: edgePath,
      edgeIndex: index,
    });
  }

  const targetType = stringValue(targetNode?.node_type);
  if (targetType && !relationSpec.target_types.includes(targetType)) {
    addIssue(issues, {
      severity: "error",
      code: "incompatible_target_type",
      message: `${edgePath} relation ${relation} does not allow target node_type ${targetType}`,
      path: edgePath,
      edgeIndex: index,
    });
  }
}

function validateRelationCardinalities(
  typed: Extraction,
  profile: NormalizedOntologyProfile,
  issues: ProfileValidationIssue[],
  metamodelTemplate?: MetamodelTemplateDocument,
): void {
  const outCountsByRelation = new Map<string, Map<string, number>>();
  const inCountsByRelation = new Map<string, Map<string, number>>();

  for (const edge of typed.edges) {
    const relation = stringValue(edge.relation);
    if (!relation) continue;
    const outMap = outCountsByRelation.get(relation) ?? new Map<string, number>();
    outMap.set(edge.source, (outMap.get(edge.source) ?? 0) + 1);
    outCountsByRelation.set(relation, outMap);

    const inMap = inCountsByRelation.get(relation) ?? new Map<string, number>();
    inMap.set(edge.target, (inMap.get(edge.target) ?? 0) + 1);
    inCountsByRelation.set(relation, inMap);
  }

  for (const [relationId, relationSpec] of Object.entries(profile.relation_types)) {
    const cardinality: OntologyRelationCardinality | undefined =
      relationSpec.cardinality ?? metamodelTemplate?.relation_types?.[relationId]?.cardinality;
    if (!cardinality || validateRelationCardinality(cardinality, `relation_types.${relationId}.cardinality`).length > 0) {
      continue;
    }

    const outCounts = outCountsByRelation.get(relationId);
    const inCounts = inCountsByRelation.get(relationId);

    typed.nodes.forEach((node, index) => {
      const nodeType = stringValue(node.node_type);
      if (!nodeType) return;
      const nodePath = `nodes[${index}]`;

      if (cardinality.out && relationSpec.source_types.includes(nodeType)) {
        const count = outCounts?.get(node.id) ?? 0;
        const { min, max } = cardinality.out;
        if (count < min || (max !== "many" && count > max)) {
          addIssue(issues, {
            severity: "error",
            code: "relation_cardinality_violation",
            message: `${nodePath} has ${count} outgoing ${relationId} edge(s), violating cardinality.out [${min}, ${String(max)}]`,
            path: `${nodePath}.relation_cardinality.${relationId}.out`,
            nodeId: node.id,
          });
        }
      }

      if (cardinality.in && relationSpec.target_types.includes(nodeType)) {
        const count = inCounts?.get(node.id) ?? 0;
        const { min, max } = cardinality.in;
        if (count < min || (max !== "many" && count > max)) {
          addIssue(issues, {
            severity: "error",
            code: "relation_cardinality_violation",
            message: `${nodePath} has ${count} incoming ${relationId} edge(s), violating cardinality.in [${min}, ${String(max)}]`,
            path: `${nodePath}.relation_cardinality.${relationId}.in`,
            nodeId: node.id,
          });
        }
      }
    });
  }
}

export function validateProfileExtraction(
  extraction: unknown,
  profileState: ProfileValidationContext,
): ProfileValidationResult {
  const profile = profileState.profile;
  const baseErrors = validateExtraction(extraction);
  const issues: ProfileValidationIssue[] = baseErrors.map((message) => ({
    severity: "error",
    code: "base_schema",
    message,
  }));

  if (baseErrors.length === 0) {
    const typed = extraction as Extraction;
    const nodesById = new Map<string, GraphNode>();
    const evidenceIds = buildEvidenceIds(typed);
    const registryRecords = buildRegistryRecords(profileState.registryExtraction);
    typed.nodes.forEach((node, index) => {
      nodesById.set(node.id, node);
      validateNode(node, profile, evidenceIds, registryRecords, issues, index, profileState.metamodelTemplate);
    });
    typed.edges.forEach((edge, index) => {
      validateEdge(edge, profile, nodesById, evidenceIds, issues, index);
    });
    validateRelationCardinalities(typed, profile, issues, profileState.metamodelTemplate);
  }

  return {
    valid: issues.every((issue) => issue.severity !== "error"),
    profile_id: profile.id,
    profile_version: profile.version,
    profile_hash: profile.profile_hash,
    baseErrors,
    issues,
  };
}

export function profileValidationResultToJson(result: ProfileValidationResult): ProfileValidationResult {
  return result;
}

export function profileValidationResultToMarkdown(result: ProfileValidationResult): string {
  const lines = [
    `# Engram Profile Validation`,
    ``,
    `Profile: ${result.profile_id} ${result.profile_version}`,
    `Profile hash: ${result.profile_hash}`,
    `Valid: ${result.valid ? "yes" : "no"}`,
    ``,
    `| severity | code | location | message |`,
    `| --- | --- | --- | --- |`,
  ];
  for (const issue of result.issues) {
    const location = issue.path ?? issue.nodeId ?? (issue.edgeIndex === undefined ? "" : `edges[${issue.edgeIndex}]`);
    lines.push(`| ${issue.severity} | ${issue.code} | ${location} | ${issue.message} |`);
  }
  if (result.issues.length === 0) {
    lines.push(`| info | ok | | No profile validation issues. |`);
  }
  return `${lines.join("\n")}\n`;
}
