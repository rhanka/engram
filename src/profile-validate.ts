import { validateExtraction } from "./validate.js";
import type { Extraction, GraphEdge, GraphNode, NormalizedOntologyProfile } from "./types.js";

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

function validateNode(
  node: GraphNode,
  profile: NormalizedOntologyProfile,
  evidenceIds: Set<string>,
  registryRecords: Map<string, Set<string>>,
  issues: ProfileValidationIssue[],
  index: number,
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

  validateStatus(node, profile, issues, { nodeId: node.id, path: nodePath });
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
      validateNode(node, profile, evidenceIds, registryRecords, issues, index);
    });
    typed.edges.forEach((edge, index) => {
      validateEdge(edge, profile, nodesById, evidenceIds, issues, index);
    });
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
    `# Graphify Profile Validation`,
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
