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
}

function isRegistrySeed(node: GraphNode): boolean {
  return Boolean(stringValue(node.registry_id) && stringValue(node.registry_record_id));
}

function validateNode(
  node: GraphNode,
  profile: NormalizedOntologyProfile,
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
    typed.nodes.forEach((node, index) => {
      nodesById.set(node.id, node);
      validateNode(node, profile, issues, index);
    });
    typed.edges.forEach((edge, index) => {
      validateEdge(edge, profile, nodesById, issues, index);
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
