import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import { parse as parseYaml } from "yaml";

import type {
  NormalizedOntologyProfile,
  NormalizedOntologyEvidencePolicy,
  NormalizedOntologyHierarchySpec,
  NormalizedOntologyInferencePolicy,
  NormalizedOntologyProfileOutputs,
  NormalizedOntologyRegistrySpec,
  NormalizedOntologyRelationType,
  NormalizedOntologyStatusTransition,
  NormalizedProjectConfig,
  OntologyCitationPolicy,
  OntologyEvidencePolicy,
  OntologyHardeningPolicy,
  OntologyHierarchySpec,
  OntologyInferencePolicy,
  OntologyNodeType,
  OntologyOutputPolicy,
  OntologyProfile,
  OntologyRegistrySpec,
  OntologyRelationType,
  OntologyStatusTransition,
} from "./types.js";

const DEFAULT_STATUSES = ["candidate", "attached", "needs_review", "validated", "rejected", "superseded"];
const VALID_CITATION_MINIMUMS = new Set(["file", "page", "section", "paragraph"]);

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asStringArray(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  }
  return typeof value === "string" && value.trim().length > 0 ? [value] : [];
}

function normalizeStringMap<T>(value: unknown): Record<string, T> {
  const record = asRecord(value);
  return Object.fromEntries(
    Object.entries(record).filter(([key, item]) => key.trim().length > 0 && asRecord(item)),
  ) as Record<string, T>;
}

function stableForHash(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableForHash);
  if (typeof value === "object" && value !== null) {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      if (key === "sourcePath" || key === "profile_hash" || key === "bound_source_path") continue;
      result[key] = stableForHash((value as Record<string, unknown>)[key]);
    }
    return result;
  }
  return value;
}

function relationEndpoints(relation: OntologyRelationType, field: "source" | "target"): string[] {
  const normalizedField = field === "source" ? relation.source_types : relation.target_types;
  return normalizedField && normalizedField.length > 0
    ? normalizedField
    : asStringArray(relation[field]);
}

function normalizeRelation(relation: OntologyRelationType): NormalizedOntologyRelationType {
  return {
    source_types: relationEndpoints(relation, "source"),
    target_types: relationEndpoints(relation, "target"),
    requires_evidence: relation.requires_evidence === true,
    assertion_basis: asStringArray(relation.assertion_basis),
    derivation_methods: asStringArray(relation.derivation_methods ?? relation.derivation_method),
  };
}

function normalizeRegistry(registry: OntologyRegistrySpec): NormalizedOntologyRegistrySpec {
  return {
    source: String(registry.source ?? ""),
    id_column: String(registry.id_column ?? ""),
    label_column: String(registry.label_column ?? ""),
    alias_columns: asStringArray(registry.alias_columns),
    node_type: String(registry.node_type ?? ""),
    ...(registry.bound_source_path ? { bound_source_path: registry.bound_source_path } : {}),
  };
}

function normalizeCitationPolicy(policy: OntologyCitationPolicy | undefined): Required<OntologyCitationPolicy> {
  const minimum = String(policy?.minimum_granularity ?? "page").toLowerCase();
  return {
    minimum_granularity: VALID_CITATION_MINIMUMS.has(minimum)
      ? minimum as "file" | "page" | "section" | "paragraph"
      : "page",
    require_source_file: policy?.require_source_file ?? true,
    allow_bbox: policy?.allow_bbox ?? "when_available",
  };
}

function normalizeStatusTransition(transition: OntologyStatusTransition): NormalizedOntologyStatusTransition {
  return {
    from_statuses: asStringArray(transition.from_statuses ?? transition.from),
    to_statuses: asStringArray(transition.to_statuses ?? transition.to),
    requires: asStringArray(transition.requires),
  };
}

function normalizeStatusTransitions(value: unknown): NormalizedOntologyStatusTransition[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => normalizeStatusTransition(asRecord(item) as OntologyStatusTransition))
    .filter((transition) => transition.from_statuses.length > 0 && transition.to_statuses.length > 0);
}

function normalizeHardeningPolicy(
  policy: OntologyHardeningPolicy | undefined,
): Required<Omit<OntologyHardeningPolicy, "status_transitions">> & {
  status_transitions: NormalizedOntologyStatusTransition[];
} {
  const statuses = asStringArray(policy?.statuses);
  return {
    statuses: statuses.length > 0 ? statuses : DEFAULT_STATUSES,
    default_status: String(policy?.default_status ?? "candidate"),
    promotion_requires: asStringArray(policy?.promotion_requires),
    status_transitions: normalizeStatusTransitions(policy?.status_transitions),
  };
}

function normalizeInferencePolicy(policy: OntologyInferencePolicy | undefined): NormalizedOntologyInferencePolicy {
  return {
    allow_inferred_relations: policy?.allow_inferred_relations ?? true,
    allowed_relation_types: asStringArray(policy?.allowed_relation_types),
    require_evidence_refs: policy?.require_evidence_refs === true,
  };
}

function normalizeEvidencePolicy(policy: OntologyEvidencePolicy | undefined): NormalizedOntologyEvidencePolicy {
  const minRefs = typeof policy?.min_refs === "number" && Number.isFinite(policy.min_refs)
    ? Math.max(0, Math.floor(policy.min_refs))
    : 0;
  return {
    require_evidence_refs: policy?.require_evidence_refs === true,
    min_refs: minRefs,
    node_types: asStringArray(policy?.node_types),
    relation_types: asStringArray(policy?.relation_types),
  };
}

function normalizeHierarchy(hierarchy: OntologyHierarchySpec): NormalizedOntologyHierarchySpec {
  return {
    registry: String(hierarchy.registry ?? ""),
    parent_column: String(hierarchy.parent_column ?? ""),
    child_column: String(hierarchy.child_column ?? ""),
    relation_type: String(hierarchy.relation_type ?? ""),
    parent_node_type: String(hierarchy.parent_node_type ?? ""),
    child_node_type: String(hierarchy.child_node_type ?? ""),
  };
}

function normalizeHierarchies(value: unknown): Record<string, NormalizedOntologyHierarchySpec> {
  return Object.fromEntries(
    Object.entries(normalizeStringMap<OntologyHierarchySpec>(value)).map(([id, hierarchy]) => [
      id,
      normalizeHierarchy(hierarchy),
    ]),
  );
}

function relationExports(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return item;
      const record = asRecord(item);
      return typeof record.relation_type === "string" ? record.relation_type : "";
    })
    .filter((item) => item.trim().length > 0);
}

function normalizeOutputs(outputs: unknown): NormalizedOntologyProfileOutputs {
  const outputRecord = asRecord(outputs);
  const ontology = asRecord(outputRecord.ontology) as OntologyOutputPolicy;
  const wiki = asRecord(ontology.wiki);
  return {
    ontology: {
      enabled: ontology.enabled === true,
      artifact_schema: typeof ontology.artifact_schema === "string" && ontology.artifact_schema.trim()
        ? ontology.artifact_schema
        : "graphify_ontology_outputs_v1",
      canonical_node_types: asStringArray(ontology.canonical_node_types),
      source_node_types: asStringArray(ontology.source_node_types),
      occurrence_node_types: asStringArray(ontology.occurrence_node_types),
      alias_fields: asStringArray(ontology.alias_fields),
      relation_exports: relationExports(ontology.relation_exports),
      wiki: {
        enabled: wiki.enabled === true,
        page_node_types: asStringArray(wiki.page_node_types),
        include_backlinks: wiki.include_backlinks === true,
        include_source_snippets: wiki.include_source_snippets === true,
      },
    },
  };
}

export function parseOntologyProfile(raw: string | Record<string, unknown>, sourcePath?: string): OntologyProfile {
  if (typeof raw !== "string") return asRecord(raw) as OntologyProfile;
  const trimmed = raw.trim();
  const parsed = extname(sourcePath ?? "").toLowerCase() === ".json" || trimmed.startsWith("{")
    ? JSON.parse(trimmed || "{}")
    : parseYaml(trimmed || "{}");
  return asRecord(parsed) as OntologyProfile;
}

export function validateOntologyProfile(profile: OntologyProfile): string[] {
  const errors: string[] = [];
  const nodeTypes = normalizeStringMap<OntologyNodeType>(profile.node_types);
  const relationTypes = normalizeStringMap<OntologyRelationType>(profile.relation_types);
  const registries = normalizeStringMap<OntologyRegistrySpec>(profile.registries);
  const outputs = normalizeOutputs(profile.outputs);
  const hardening = normalizeHardeningPolicy(profile.hardening);
  const inferencePolicy = normalizeInferencePolicy(profile.inference_policy);
  const evidencePolicy = normalizeEvidencePolicy(profile.evidence_policy);
  const hierarchies = normalizeHierarchies(profile.hierarchies);
  const knownNodeTypes = new Set(Object.keys(nodeTypes));
  const knownRelationTypes = new Set(Object.keys(relationTypes));
  const knownRegistries = new Set(Object.keys(registries));
  const knownStatuses = new Set(hardening.statuses);

  if (typeof profile.id !== "string" || profile.id.trim().length === 0) {
    errors.push("id is required");
  }
  if (profile.version === undefined || String(profile.version).trim().length === 0) {
    errors.push("version is required");
  }
  if (knownNodeTypes.size === 0) {
    errors.push("node_types must contain at least one node type");
  }
  if (!knownStatuses.has(hardening.default_status)) {
    errors.push(`hardening.default_status references unknown status ${hardening.default_status}`);
  }

  for (const [relationId, relation] of Object.entries(relationTypes)) {
    const sourceTypes = relationEndpoints(relation, "source");
    const targetTypes = relationEndpoints(relation, "target");
    if (sourceTypes.length === 0) {
      errors.push(`relation_types.${relationId}.source is required`);
    }
    if (targetTypes.length === 0) {
      errors.push(`relation_types.${relationId}.target is required`);
    }
    for (const source of sourceTypes) {
      if (!knownNodeTypes.has(source)) {
        errors.push(`relation_types.${relationId}.source references unknown node type ${source}`);
      }
    }
    for (const target of targetTypes) {
      if (!knownNodeTypes.has(target)) {
        errors.push(`relation_types.${relationId}.target references unknown node type ${target}`);
      }
    }
  }

  hardening.status_transitions.forEach((transition, index) => {
    for (const status of transition.from_statuses) {
      if (!knownStatuses.has(status)) {
        errors.push(`hardening.status_transitions[${index}].from references unknown status ${status}`);
      }
    }
    for (const status of transition.to_statuses) {
      if (!knownStatuses.has(status)) {
        errors.push(`hardening.status_transitions[${index}].to references unknown status ${status}`);
      }
    }
  });

  for (const relationType of inferencePolicy.allowed_relation_types) {
    if (!knownRelationTypes.has(relationType)) {
      errors.push(`inference_policy.allowed_relation_types references unknown relation type ${relationType}`);
    }
  }

  for (const nodeType of evidencePolicy.node_types) {
    if (!knownNodeTypes.has(nodeType)) {
      errors.push(`evidence_policy.node_types references unknown node type ${nodeType}`);
    }
  }
  for (const relationType of evidencePolicy.relation_types) {
    if (!knownRelationTypes.has(relationType)) {
      errors.push(`evidence_policy.relation_types references unknown relation type ${relationType}`);
    }
  }

  for (const [hierarchyId, hierarchy] of Object.entries(hierarchies)) {
    if (!hierarchy.registry) {
      errors.push(`hierarchies.${hierarchyId}.registry is required`);
    } else if (!knownRegistries.has(hierarchy.registry)) {
      errors.push(`hierarchies.${hierarchyId}.registry references unknown registry ${hierarchy.registry}`);
    }
    if (!hierarchy.parent_column) {
      errors.push(`hierarchies.${hierarchyId}.parent_column is required`);
    }
    if (!hierarchy.child_column) {
      errors.push(`hierarchies.${hierarchyId}.child_column is required`);
    }
    if (!hierarchy.relation_type) {
      errors.push(`hierarchies.${hierarchyId}.relation_type is required`);
    } else if (!knownRelationTypes.has(hierarchy.relation_type)) {
      errors.push(`hierarchies.${hierarchyId}.relation_type references unknown relation type ${hierarchy.relation_type}`);
    }
    if (!hierarchy.parent_node_type) {
      errors.push(`hierarchies.${hierarchyId}.parent_node_type is required`);
    } else if (!knownNodeTypes.has(hierarchy.parent_node_type)) {
      errors.push(`hierarchies.${hierarchyId}.parent_node_type references unknown node type ${hierarchy.parent_node_type}`);
    }
    if (!hierarchy.child_node_type) {
      errors.push(`hierarchies.${hierarchyId}.child_node_type is required`);
    } else if (!knownNodeTypes.has(hierarchy.child_node_type)) {
      errors.push(`hierarchies.${hierarchyId}.child_node_type references unknown node type ${hierarchy.child_node_type}`);
    }
  }

  for (const [registryId, registry] of Object.entries(registries)) {
    if (typeof registry.source !== "string" || registry.source.trim().length === 0) {
      errors.push(`registries.${registryId}.source is required`);
    }
    if (typeof registry.id_column !== "string" || registry.id_column.trim().length === 0) {
      errors.push(`registries.${registryId}.id_column is required`);
    }
    if (typeof registry.label_column !== "string" || registry.label_column.trim().length === 0) {
      errors.push(`registries.${registryId}.label_column is required`);
    }
    if (typeof registry.node_type !== "string" || registry.node_type.trim().length === 0) {
      errors.push(`registries.${registryId}.node_type is required`);
    } else if (!knownNodeTypes.has(registry.node_type)) {
      errors.push(`registries.${registryId}.node_type references unknown node type ${registry.node_type}`);
    }
  }

  for (const nodeType of outputs.ontology.canonical_node_types) {
    if (!knownNodeTypes.has(nodeType)) {
      errors.push(`outputs.ontology.canonical_node_types references unknown node type ${nodeType}`);
    }
  }
  for (const nodeType of outputs.ontology.source_node_types) {
    if (!knownNodeTypes.has(nodeType)) {
      errors.push(`outputs.ontology.source_node_types references unknown node type ${nodeType}`);
    }
  }
  for (const nodeType of outputs.ontology.occurrence_node_types) {
    if (!knownNodeTypes.has(nodeType)) {
      errors.push(`outputs.ontology.occurrence_node_types references unknown node type ${nodeType}`);
    }
  }
  for (const nodeType of outputs.ontology.wiki.page_node_types) {
    if (!knownNodeTypes.has(nodeType)) {
      errors.push(`outputs.ontology.wiki.page_node_types references unknown node type ${nodeType}`);
    }
  }
  for (const relationType of outputs.ontology.relation_exports) {
    if (!knownRelationTypes.has(relationType)) {
      errors.push(`outputs.ontology.relation_exports references unknown relation type ${relationType}`);
    }
  }

  return errors;
}

export function hashOntologyProfile(profile: OntologyProfile | NormalizedOntologyProfile): string {
  const h = createHash("sha256");
  h.update(JSON.stringify(stableForHash(profile)));
  return h.digest("hex");
}

export function normalizeOntologyProfile(profile: OntologyProfile, sourcePath?: string): NormalizedOntologyProfile {
  const errors = validateOntologyProfile(profile);
  if (errors.length > 0) {
    throw new Error(`Invalid ontology profile:\n${errors.map((item) => `  - ${item}`).join("\n")}`);
  }

  const nodeTypes = normalizeStringMap<OntologyNodeType>(profile.node_types);
  const relationTypes = normalizeStringMap<OntologyRelationType>(profile.relation_types);
  const registries = normalizeStringMap<OntologyRegistrySpec>(profile.registries);
  const hardening = normalizeHardeningPolicy(profile.hardening);
  const normalized: Omit<NormalizedOntologyProfile, "profile_hash"> = {
    id: profile.id!,
    version: String(profile.version),
    default_language: profile.default_language ?? "en",
    ...(sourcePath ? { sourcePath: resolve(sourcePath) } : profile.sourcePath ? { sourcePath: profile.sourcePath } : {}),
    node_types: nodeTypes,
    relation_types: Object.fromEntries(
      Object.entries(relationTypes).map(([id, relation]) => [id, normalizeRelation(relation)]),
    ),
    registries: Object.fromEntries(
      Object.entries(registries).map(([id, registry]) => [id, normalizeRegistry(registry)]),
    ),
    citation_policy: normalizeCitationPolicy(profile.citation_policy),
    hardening,
    inference_policy: normalizeInferencePolicy(profile.inference_policy),
    evidence_policy: normalizeEvidencePolicy(profile.evidence_policy),
    hierarchies: normalizeHierarchies(profile.hierarchies),
    outputs: normalizeOutputs(profile.outputs),
  };

  return {
    ...normalized,
    profile_hash: hashOntologyProfile(normalized),
  };
}

export function bindOntologyProfile(
  profile: NormalizedOntologyProfile,
  projectConfig: NormalizedProjectConfig,
): NormalizedOntologyProfile {
  const registries: Record<string, NormalizedOntologyRegistrySpec> = {};
  for (const [registryId, registry] of Object.entries(profile.registries)) {
    const bound = projectConfig.inputs.registrySources[registry.source];
    if (!bound) {
      throw new Error(
        `registries.${registryId}.source references unknown project registry source ${registry.source}`,
      );
    }
    registries[registryId] = {
      ...registry,
      bound_source_path: bound,
    };
  }
  const boundProfile = { ...profile, registries };
  return {
    ...boundProfile,
    profile_hash: hashOntologyProfile(boundProfile),
  };
}

export function loadOntologyProfile(
  profilePath: string,
  options: { projectConfig?: NormalizedProjectConfig } = {},
): NormalizedOntologyProfile {
  const resolved = resolve(profilePath);
  const raw = readFileSync(resolved, "utf-8");
  const normalized = normalizeOntologyProfile(parseOntologyProfile(raw, resolved), resolved);
  return options.projectConfig ? bindOntologyProfile(normalized, options.projectConfig) : normalized;
}
