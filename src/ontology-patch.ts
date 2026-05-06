import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import type { ProfileState } from "./configured-dataprep.js";
import type { NormalizedOntologyProfile, OntologyStatus } from "./types.js";

export const ONTOLOGY_PATCH_SCHEMA = "graphify_ontology_patch_v1";

export type OntologyPatchOperation =
  | "accept_match"
  | "reject_match"
  | "create_canonical"
  | "merge_alias"
  | "set_status"
  | "add_relation"
  | "reject_relation"
  | "deprecate_entity"
  | "supersede_entity";

export type OntologyPatchStatus = "proposed" | "applied" | "rejected";

export interface OntologyPatch {
  schema: typeof ONTOLOGY_PATCH_SCHEMA;
  id: string;
  operation: OntologyPatchOperation;
  status: OntologyPatchStatus;
  profile_hash: string;
  graph_hash: string;
  target: Record<string, unknown>;
  evidence_refs: string[];
  reason: string;
  author: string;
  created_at: string;
  [key: string]: unknown;
}

export interface OntologyPatchNode {
  id: string;
  type?: string;
  status?: OntologyStatus;
  source_refs?: string[];
}

export interface OntologyPatchRelation {
  id?: string;
  type?: string;
  source_id?: string;
  target_id?: string;
  evidence_refs?: string[];
}

export interface OntologyPatchContext {
  rootDir: string;
  stateDir: string;
  graphHash: string;
  profile: NormalizedOntologyProfile;
  profileState: ProfileState;
  nodes: OntologyPatchNode[];
  relations: OntologyPatchRelation[];
  evidenceRefs: Set<string>;
  decisionsPath?: string;
  dirtyWorktree?: boolean;
  now?: () => string;
  author?: string;
}

export interface OntologyPatchIssue {
  severity: "error" | "warning";
  message: string;
}

export interface OntologyPatchValidationResult {
  schema: "graphify_ontology_patch_validation_v1";
  patch_id: string | null;
  valid: boolean;
  issues: OntologyPatchIssue[];
}

export interface OntologyPatchChangedFile {
  path: string;
  kind: "authoritative_decision_log" | "audit_log" | "stale_marker";
  action: "append" | "write";
}

export interface OntologyPatchApplyOptions {
  dryRun?: boolean;
  write?: boolean;
}

export interface OntologyPatchApplyResult {
  schema: "graphify_ontology_patch_apply_v1";
  patch_id: string | null;
  valid: boolean;
  issues: OntologyPatchIssue[];
  dry_run: boolean;
  changed_files: OntologyPatchChangedFile[];
}

const OPERATIONS = new Set<OntologyPatchOperation>([
  "accept_match",
  "reject_match",
  "create_canonical",
  "merge_alias",
  "set_status",
  "add_relation",
  "reject_relation",
  "deprecate_entity",
  "supersede_entity",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function addError(issues: OntologyPatchIssue[], message: string): void {
  issues.push({ severity: "error", message });
}

function addWarning(issues: OntologyPatchIssue[], message: string): void {
  issues.push({ severity: "warning", message });
}

function nodeType(node: OntologyPatchNode | undefined): string | null {
  return nonEmptyString(node?.type) ?? null;
}

function nodeById(context: OntologyPatchContext, id: string | null): OntologyPatchNode | undefined {
  return id ? context.nodes.find((node) => node.id === id) : undefined;
}

function relationById(context: OntologyPatchContext, id: string | null): OntologyPatchRelation | undefined {
  return id ? context.relations.find((relation) => relation.id === id) : undefined;
}

function knownEvidenceRefs(context: OntologyPatchContext): Set<string> {
  const refs = new Set(context.evidenceRefs);
  for (const node of context.nodes) {
    for (const ref of node.source_refs ?? []) refs.add(ref);
  }
  for (const relation of context.relations) {
    for (const ref of relation.evidence_refs ?? []) refs.add(ref);
  }
  return refs;
}

function validateEvidenceRefs(patch: OntologyPatch, context: OntologyPatchContext, issues: OntologyPatchIssue[]): void {
  if (patch.evidence_refs.length === 0) {
    addError(issues, "evidence_refs must contain at least one reference");
    return;
  }
  const refs = knownEvidenceRefs(context);
  for (const ref of patch.evidence_refs) {
    if (!refs.has(ref)) addError(issues, `Unknown evidence_ref ${ref}`);
  }
}

function statusTransitionAllowed(
  profile: NormalizedOntologyProfile,
  fromStatus: string,
  toStatus: string,
): boolean {
  if (!profile.hardening.statuses.includes(toStatus)) return false;
  if (profile.hardening.status_transitions.length === 0) return true;
  return profile.hardening.status_transitions.some((transition) =>
    transition.from_statuses.includes(fromStatus) && transition.to_statuses.includes(toStatus)
  );
}

function validateAcceptMatch(patch: OntologyPatch, context: OntologyPatchContext, issues: OntologyPatchIssue[]): void {
  const candidateId = nonEmptyString(patch.target.candidate_id);
  const canonicalId = nonEmptyString(patch.target.canonical_id);
  if (!nodeById(context, candidateId)) addError(issues, "target.candidate_id does not exist in ontology nodes");
  if (!nodeById(context, canonicalId)) addError(issues, "target.canonical_id does not exist in ontology nodes");
}

function validateSetStatus(patch: OntologyPatch, context: OntologyPatchContext, issues: OntologyPatchIssue[]): void {
  const node = nodeById(context, nonEmptyString(patch.target.node_id));
  if (!node) {
    addError(issues, "target.node_id does not exist in ontology nodes");
    return;
  }
  const fromStatus = nonEmptyString(patch.target.from_status) ?? nonEmptyString(node.status) ?? context.profile.hardening.default_status;
  const toStatus = nonEmptyString(patch.target.to_status);
  if (!toStatus) {
    addError(issues, "target.to_status is required");
    return;
  }
  if (!statusTransitionAllowed(context.profile, fromStatus, toStatus)) {
    addError(issues, `status transition ${fromStatus} -> ${toStatus} is not allowed by profile policy`);
  }
}

function validateAddRelation(patch: OntologyPatch, context: OntologyPatchContext, issues: OntologyPatchIssue[]): void {
  const source = nodeById(context, nonEmptyString(patch.target.source_id));
  const target = nodeById(context, nonEmptyString(patch.target.target_id));
  const relationType = nonEmptyString(patch.target.relation_type);
  if (!source) addError(issues, "target.source_id does not exist in ontology nodes");
  if (!target) addError(issues, "target.target_id does not exist in ontology nodes");
  if (!relationType) {
    addError(issues, "target.relation_type is required");
    return;
  }
  const relation = context.profile.relation_types[relationType];
  if (!relation) {
    addError(issues, `target.relation_type references unknown relation type ${relationType}`);
    return;
  }
  if (!source || !target) return;
  const sourceType = nodeType(source);
  const targetType = nodeType(target);
  const sourceAllowed = sourceType !== null && relation.source_types.includes(sourceType);
  const targetAllowed = targetType !== null && relation.target_types.includes(targetType);
  if (!sourceAllowed || !targetAllowed) {
    addError(issues, `relation endpoint types ${sourceType ?? "unknown"} -> ${targetType ?? "unknown"} are not allowed for ${relationType}`);
  }
}

function validateOperationTargets(patch: OntologyPatch, context: OntologyPatchContext, issues: OntologyPatchIssue[]): void {
  switch (patch.operation) {
    case "accept_match":
      validateAcceptMatch(patch, context, issues);
      return;
    case "reject_match":
      if (!nonEmptyString(patch.target.candidate_id) && !nonEmptyString(patch.target.mapping_id)) {
        addError(issues, "reject_match requires target.candidate_id or target.mapping_id");
      }
      return;
    case "create_canonical": {
      const type = nonEmptyString(patch.target.type);
      if (!type) addError(issues, "create_canonical requires target.type");
      else if (!context.profile.node_types[type]) addError(issues, `target.type references unknown node type ${type}`);
      if (!nonEmptyString(patch.target.label)) addError(issues, "create_canonical requires target.label");
      return;
    }
    case "merge_alias":
      if (!nodeById(context, nonEmptyString(patch.target.canonical_id))) {
        addError(issues, "target.canonical_id does not exist in ontology nodes");
      }
      if (!nonEmptyString(patch.target.alias)) addError(issues, "merge_alias requires target.alias");
      return;
    case "set_status":
      validateSetStatus(patch, context, issues);
      return;
    case "add_relation":
      validateAddRelation(patch, context, issues);
      return;
    case "reject_relation":
      if (!relationById(context, nonEmptyString(patch.target.relation_id)) && !nonEmptyString(patch.target.relation_type)) {
        addError(issues, "reject_relation requires target.relation_id or target.relation_type");
      }
      return;
    case "deprecate_entity":
      if (!nodeById(context, nonEmptyString(patch.target.node_id))) {
        addError(issues, "target.node_id does not exist in ontology nodes");
      }
      return;
    case "supersede_entity":
      if (!nodeById(context, nonEmptyString(patch.target.deprecated_id))) {
        addError(issues, "target.deprecated_id does not exist in ontology nodes");
      }
      if (!nodeById(context, nonEmptyString(patch.target.replacement_id))) {
        addError(issues, "target.replacement_id does not exist in ontology nodes");
      }
      return;
  }
}

export function normalizeOntologyPatch(value: unknown): OntologyPatch | null {
  if (!isRecord(value)) return null;
  const operation = nonEmptyString(value.operation) as OntologyPatchOperation | null;
  if (!operation || !OPERATIONS.has(operation)) return null;
  const target = isRecord(value.target) ? value.target : {};
  return {
    ...value,
    schema: value.schema as typeof ONTOLOGY_PATCH_SCHEMA,
    id: nonEmptyString(value.id) ?? "",
    operation,
    status: (nonEmptyString(value.status) ?? "proposed") as OntologyPatchStatus,
    profile_hash: nonEmptyString(value.profile_hash) ?? "",
    graph_hash: nonEmptyString(value.graph_hash) ?? "",
    target,
    evidence_refs: stringArray(value.evidence_refs),
    reason: nonEmptyString(value.reason) ?? "",
    author: nonEmptyString(value.author) ?? "",
    created_at: nonEmptyString(value.created_at) ?? "",
  };
}

export function validateOntologyPatch(value: unknown, context: OntologyPatchContext): OntologyPatchValidationResult {
  const issues: OntologyPatchIssue[] = [];
  const patch = normalizeOntologyPatch(value);
  if (!patch) {
    return {
      schema: "graphify_ontology_patch_validation_v1",
      patch_id: null,
      valid: false,
      issues: [{ severity: "error", message: "patch is not a valid ontology patch object" }],
    };
  }

  if (patch.schema !== ONTOLOGY_PATCH_SCHEMA) addError(issues, `schema must be ${ONTOLOGY_PATCH_SCHEMA}`);
  if (!patch.id) addError(issues, "id is required");
  if (!patch.reason) addError(issues, "reason is required");
  if (!patch.author) addError(issues, "author is required");
  if (!patch.created_at) addError(issues, "created_at is required");
  if (patch.profile_hash !== context.profile.profile_hash) addError(issues, "profile_hash does not match active profile");
  if (patch.graph_hash !== context.graphHash) addError(issues, "graph_hash does not match active graph");
  validateEvidenceRefs(patch, context, issues);
  validateOperationTargets(patch, context, issues);
  if (context.dirtyWorktree) addWarning(issues, "Git worktree is dirty; review local changes before non-dry-run apply");

  return {
    schema: "graphify_ontology_patch_validation_v1",
    patch_id: patch.id,
    valid: issues.every((issue) => issue.severity !== "error"),
    issues,
  };
}

function isInside(path: string, root: string): boolean {
  const rel = relative(resolve(root), resolve(path));
  return rel === "" || (!rel.startsWith("..") && !rel.startsWith(sep) && !isAbsolute(rel));
}

function appendJsonLine(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(value)}\n`, "utf-8");
}

function auditPath(context: OntologyPatchContext, patch: OntologyPatch): string {
  const rejected = patch.operation.startsWith("reject") || patch.status === "rejected";
  return join(
    context.stateDir,
    "ontology",
    "reconciliation",
    rejected ? "rejected-patches.jsonl" : "applied-patches.jsonl",
  );
}

function changedFiles(context: OntologyPatchContext, patch: OntologyPatch): OntologyPatchChangedFile[] {
  return [
    {
      path: context.decisionsPath ?? "",
      kind: "authoritative_decision_log",
      action: "append",
    },
    {
      path: auditPath(context, patch),
      kind: "audit_log",
      action: "append",
    },
    {
      path: join(context.stateDir, "needs_update"),
      kind: "stale_marker",
      action: "write",
    },
  ];
}

export function applyOntologyPatch(
  value: unknown,
  context: OntologyPatchContext,
  options: OntologyPatchApplyOptions = {},
): OntologyPatchApplyResult {
  const patch = normalizeOntologyPatch(value);
  const validation = validateOntologyPatch(value, context);
  const write = options.write === true;
  const dryRun = options.dryRun === true || !write;
  const issues = [...validation.issues];

  if (write) {
    if (!context.decisionsPath) {
      addError(issues, "write apply requires a configured authoritative decisionsPath");
    } else if (!isInside(context.decisionsPath, context.rootDir)) {
      addError(issues, "configured decisionsPath escapes the repository path jail");
    }
  }

  const valid = issues.every((issue) => issue.severity !== "error");
  const files = patch ? changedFiles(context, patch).filter((file) => file.path.length > 0) : [];
  const result: OntologyPatchApplyResult = {
    schema: "graphify_ontology_patch_apply_v1",
    patch_id: validation.patch_id,
    valid,
    issues,
    dry_run: dryRun,
    changed_files: files,
  };
  if (!valid || dryRun || !patch) return result;

  const appliedAt = context.now?.() ?? new Date().toISOString();
  const record = {
    ...patch,
    status: patch.operation.startsWith("reject") ? "rejected" : "applied",
    applied_at: appliedAt,
    applied_by: context.author ?? patch.author,
  };

  appendJsonLine(context.decisionsPath!, record);
  appendJsonLine(auditPath(context, patch), record);
  mkdirSync(context.stateDir, { recursive: true });
  writeFileSync(join(context.stateDir, "needs_update"), `ontology patch applied: ${patch.id}\n`, "utf-8");
  return result;
}
